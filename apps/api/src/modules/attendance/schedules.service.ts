import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, ShiftType } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  addDays,
  dateColumn,
  eachDay,
  monthRange,
  toVnDate,
  weekdayOf,
  ymdOf,
  type ApplySchedulePatternInput,
  type CopyScheduleWeekInput,
  type SetScheduleCellsInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { ExcelService } from '../../common/excel/excel.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../hr/employees.service';
import type { RecomputeItem } from './attendance.constants';
import { TimesheetService } from './timesheet.service';

const PERM: Record<ShiftType, string> = { WORK: 'attendance.schedule.manage', DUTY: 'duty.roster.manage' };

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly timesheet: TimesheetService,
    private readonly excel: ExcelService,
  ) {}

  private assertCanEdit(actor: AuthUser, types: ShiftType[]) {
    for (const t of new Set(types)) {
      if (!actor.permissions.has(PERM[t])) {
        throw new ForbiddenException(t === 'DUTY' ? 'Bạn không có quyền xếp lịch trực' : 'Bạn không có quyền xếp lịch làm việc');
      }
    }
  }

  private async unitEmployees(actor: AuthUser, unitId: string) {
    return this.prisma.employee.findMany({
      where: { AND: [this.employees.scope(actor), { unitId, status: { in: ACTIVE_EMPLOYEE_STATUSES } }] },
      select: { id: true, code: true, fullName: true, positionCode: true },
      orderBy: { code: 'asc' },
    });
  }

  async grid(actor: AuthUser, unitId: string, month: string, shiftType?: ShiftType) {
    const unit = await this.timesheet.assertUnitInScope(actor, unitId);
    const { from, to } = monthRange(month);
    const employees = await this.unitEmployees(actor, unitId);
    const ids = employees.map((e) => e.id);
    const [schedules, leaves, holidays, period] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { employeeId: { in: ids }, date: { gte: dateColumn(from), lte: dateColumn(to) }, shift: shiftType ? { type: shiftType } : undefined },
        select: { employeeId: true, date: true, shiftId: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { employeeId: { in: ids }, status: { in: ['APPROVED', 'PENDING'] }, fromDate: { lte: dateColumn(to) }, toDate: { gte: dateColumn(from) } },
        select: { employeeId: true, fromDate: true, toDate: true, status: true, leaveType: { select: { symbol: true } } },
      }),
      this.prisma.holiday.findMany({ where: { date: { gte: dateColumn(from), lte: dateColumn(to) } } }),
      this.prisma.timesheetPeriod.findUnique({ where: { unitId_month: { unitId, month } } }),
    ]);
    return {
      unit: { id: unit.id, name: unit.name, defaultShiftId: unit.defaultShiftId },
      month,
      days: eachDay(from, to),
      holidays: holidays.map((h) => ({ date: ymdOf(h.date), name: h.name })),
      locked: period?.status === 'CLOSED',
      employees: employees.map((e) => ({
        ...e,
        cells: Object.fromEntries(
          eachDay(from, to).map((d) => [d, schedules.filter((s) => s.employeeId === e.id && ymdOf(s.date) === d).map((s) => s.shiftId)]),
        ),
        leaves: leaves
          .filter((l) => l.employeeId === e.id)
          .map((l) => ({ from: ymdOf(l.fromDate), to: ymdOf(l.toDate), symbol: l.leaveType.symbol, status: l.status })),
      })),
    };
  }

  /** Gán ca từng ô. shiftIds rỗng = xóa ca (trong phạm vi shiftType). */
  async setCells(actor: AuthUser, input: SetScheduleCellsInput, meta: RequestMeta) {
    const shiftIds = [...new Set(input.cells.flatMap((c) => c.shiftIds))];
    const shifts = await this.prisma.shift.findMany({ where: { id: { in: shiftIds }, isActive: true } });
    if (shifts.length !== shiftIds.length) throw new BadRequestException('Ca không tồn tại hoặc đã ngừng dùng');
    if (input.shiftType && shifts.some((s) => s.type !== input.shiftType)) throw new BadRequestException('Ca không đúng loại lịch');
    // Không chỉ định loại lịch: xóa ô ảnh hưởng cả lịch làm việc lẫn lịch trực → cần cả hai quyền
    const hasDeletion = input.cells.some((c) => !c.shiftIds.length);
    this.assertCanEdit(actor, input.shiftType ? [input.shiftType] : hasDeletion ? ['WORK', 'DUTY'] : shifts.map((s) => s.type));
    await this.assertEmployeesWritable(actor, input.cells.map((c) => c.employeeId), input.cells.map((c) => c.date));

    const typeFilter: Prisma.ScheduleWhereInput = input.shiftType ? { shift: { type: input.shiftType } } : {};
    await this.prisma.$transaction(async (tx) => {
      for (const c of input.cells) {
        await tx.schedule.deleteMany({ where: { employeeId: c.employeeId, date: dateColumn(c.date), ...typeFilter } });
        if (c.shiftIds.length) {
          await tx.schedule.createMany({
            data: c.shiftIds.map((shiftId) => ({ employeeId: c.employeeId, date: dateColumn(c.date), shiftId, createdBy: actor.id })),
            skipDuplicates: true,
          });
        }
      }
      await this.audit.log({ actor, action: 'UPDATE', entity: 'schedule', after: { cells: input.cells.length, shiftType: input.shiftType }, meta }, tx);
    });
    await this.recomputePast(input.cells.map((c) => ({ employeeId: c.employeeId, from: c.date, to: c.date })));
    return { updated: input.cells.length };
  }

  /** Áp một ca cho nhiều người theo thứ trong tuần */
  async applyPattern(actor: AuthUser, input: ApplySchedulePatternInput, meta: RequestMeta) {
    const shift = await this.prisma.shift.findFirst({ where: { id: input.shiftId, isActive: true } });
    if (!shift) throw new BadRequestException('Ca không tồn tại');
    this.assertCanEdit(actor, [shift.type]);
    const from = ymdOf(input.from);
    const to = ymdOf(input.to);
    if (to < from) throw new BadRequestException('Đến ngày phải sau từ ngày');
    const days = eachDay(from, to).filter((d) => input.weekdays.includes(weekdayOf(d)));
    if (days.length > 93) throw new BadRequestException('Tối đa 3 tháng mỗi lần');
    await this.assertEmployeesWritable(actor, input.employeeIds, [from, to]);

    await this.prisma.$transaction(async (tx) => {
      if (input.replace) {
        await tx.schedule.deleteMany({
          where: { employeeId: { in: input.employeeIds }, date: { in: days.map(dateColumn) }, shift: { type: shift.type } },
        });
      }
      await tx.schedule.createMany({
        data: input.employeeIds.flatMap((employeeId) => days.map((d) => ({ employeeId, date: dateColumn(d), shiftId: shift.id, createdBy: actor.id }))),
        skipDuplicates: true,
      });
      await this.audit.log({ actor, action: 'APPLY_PATTERN', entity: 'schedule', after: { ...input, days: days.length }, meta }, tx);
    }, { timeout: 60_000 });
    await this.recomputePast(input.employeeIds.map((employeeId) => ({ employeeId, from, to })));
    return { created: input.employeeIds.length * days.length };
  }

  /** Sao chép lịch 7 ngày từ tuần nguồn sang các tuần đích (cùng đơn vị) */
  async copyWeek(actor: AuthUser, input: CopyScheduleWeekInput, meta: RequestMeta) {
    await this.timesheet.assertUnitInScope(actor, input.unitId);
    const types: ShiftType[] = input.shiftType ? [input.shiftType] : ['WORK', 'DUTY'];
    this.assertCanEdit(actor, types);
    const src = ymdOf(input.sourceWeekStart);
    const employees = await this.unitEmployees(actor, input.unitId);
    const ids = employees.map((e) => e.id);
    const source = await this.prisma.schedule.findMany({
      where: { employeeId: { in: ids }, date: { gte: dateColumn(src), lte: dateColumn(addDays(src, 6)) }, shift: { type: { in: types } } },
    });
    let created = 0;
    const touched: RecomputeItem[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const t of input.targetWeekStarts.map(ymdOf)) {
        await this.assertEmployeesWritable(actor, ids, [t, addDays(t, 6)]);
        await tx.schedule.deleteMany({
          where: { employeeId: { in: ids }, date: { gte: dateColumn(t), lte: dateColumn(addDays(t, 6)) }, shift: { type: { in: types } } },
        });
        const offsetDays = Math.round((dateColumn(t).getTime() - dateColumn(src).getTime()) / 86_400_000);
        const r = await tx.schedule.createMany({
          data: source.map((s) => ({ employeeId: s.employeeId, date: dateColumn(addDays(ymdOf(s.date), offsetDays)), shiftId: s.shiftId, createdBy: actor.id })),
          skipDuplicates: true,
        });
        created += r.count;
        touched.push(...ids.map((employeeId) => ({ employeeId, from: t, to: addDays(t, 6) })));
      }
      await this.audit.log({ actor, action: 'COPY_WEEK', entity: 'schedule', after: { ...input, created }, meta }, tx);
    });
    await this.recomputePast(touched);
    return { created };
  }

  // -------- Excel --------

  async exportXlsx(actor: AuthUser, unitId: string, month: string, shiftType?: ShiftType) {
    const g = await this.grid(actor, unitId, month, shiftType);
    const shifts = await this.prisma.shift.findMany();
    const codeOf = new Map(shifts.map((s) => [s.id, s.code]));
    return this.excel.build([
      {
        name: shiftType === 'DUTY' ? 'Lịch trực' : 'Lịch làm việc',
        rows: g.employees,
        columns: [
          { header: 'Mã NV', value: (e) => e.code },
          { header: 'Họ và tên', width: 26, value: (e) => e.fullName },
          ...g.days.map((d) => ({
            header: d.split('-').reverse().slice(0, 2).join('/'),
            width: 7,
            value: (e: (typeof g.employees)[number]) => e.cells[d].map((id) => codeOf.get(id)).join('+') || null,
          })),
        ],
      },
      {
        name: 'Mã ca',
        rows: shifts.filter((s) => s.isActive && (!shiftType || s.type === shiftType)),
        columns: [
          { header: 'Mã ca', value: (s) => s.code },
          { header: 'Tên ca', width: 30, value: (s) => s.name },
          { header: 'Giờ', width: 14, value: (s) => `${s.startTime}–${s.endTime}` },
        ],
      },
    ]);
  }

  /** Import lịch từ file đã xuất (cột ngày dd/MM, ô = mã ca, nhiều ca nối bằng "+"). Ô trống = xóa ca. */
  async importXlsx(actor: AuthUser, unitId: string, month: string, shiftType: ShiftType | undefined, buffer: Buffer | undefined, meta: RequestMeta) {
    if (!buffer) throw new BadRequestException('Chưa chọn file');
    await this.timesheet.assertUnitInScope(actor, unitId);
    const { headers, rows } = await this.excel.parse(buffer);
    const { from, to } = monthRange(month);
    const days = eachDay(from, to);
    const dayOfHeader = new Map(days.map((d) => [d.split('-').reverse().slice(0, 2).join('/'), d]));
    const shifts = await this.prisma.shift.findMany({ where: { isActive: true, ...(shiftType ? { type: shiftType } : {}) } });
    const shiftOf = new Map(shifts.map((s) => [s.code.toUpperCase(), s.id]));
    const employees = await this.unitEmployees(actor, unitId);
    const empOf = new Map(employees.map((e) => [e.code, e.id]));

    const errors: string[] = [];
    const cells: SetScheduleCellsInput['cells'] = [];
    for (const { rowNumber, values } of rows) {
      const employeeId = empOf.get(String(values['Mã NV'] ?? '').toUpperCase());
      if (!employeeId) {
        errors.push(`Dòng ${rowNumber}: mã NV "${values['Mã NV'] ?? ''}" không thuộc đơn vị`);
        continue;
      }
      for (const h of headers) {
        const date = dayOfHeader.get(h);
        if (!date) continue;
        const raw = values[h];
        const codes = raw ? String(raw).toUpperCase().split('+').map((s) => s.trim()).filter(Boolean) : [];
        const ids = codes.map((c) => shiftOf.get(c));
        if (ids.some((x) => !x)) {
          errors.push(`Dòng ${rowNumber}, ngày ${h}: mã ca "${raw}" không hợp lệ`);
          continue;
        }
        cells.push({ employeeId, date, shiftIds: ids as string[] });
      }
    }
    if (errors.length) throw new BadRequestException({ message: `File có ${errors.length} lỗi — chưa ghi dữ liệu`, errors: { file: errors.slice(0, 50) } });
    if (!cells.length) throw new BadRequestException('File không có dữ liệu lịch');
    return this.setCells(actor, { cells, shiftType }, meta);
  }

  // -------- Nội bộ --------

  /** Nhân viên phải trong phạm vi; tháng đã chốt công thì không sửa lịch */
  private async assertEmployeesWritable(actor: AuthUser, employeeIds: string[], dates: string[]) {
    const ids = [...new Set(employeeIds)];
    const emps = await this.prisma.employee.findMany({ where: { id: { in: ids }, ...this.employees.scope(actor) }, select: { id: true, unitId: true } });
    if (emps.length !== ids.length) throw new ForbiddenException('Có nhân viên ngoài phạm vi quản lý');
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const closed = await this.prisma.timesheetPeriod.findFirst({
      where: { unitId: { in: [...new Set(emps.map((e) => e.unitId))] }, month: { in: months }, status: 'CLOSED' },
    });
    if (closed) throw new BadRequestException(`Công tháng ${closed.month} đã chốt — không sửa được lịch`);
  }

  private async recomputePast(items: RecomputeItem[]) {
    const today = toVnDate(new Date());
    const past = items.filter((i) => i.from <= today).map((i) => ({ ...i, to: i.to > today ? today : i.to }));
    if (past.length) await this.timesheet.enqueueRecompute(past);
  }
}
