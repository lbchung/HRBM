import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DailyTimesheet, Prisma } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  aggregateMonth,
  computeDay,
  dateColumn,
  eachDay,
  leaveSessionOn,
  monthRange,
  toVnDate,
  vnDateTime,
  ymdOf,
  type AdjustTimesheetInput,
  type EngineShift,
  type MonthRowInput,
  type PeriodActionInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../hr/employees.service';
import { QUEUE_TIMESHEET, type RecomputeItem } from './attendance.constants';

type ShiftRow = Prisma.ShiftGetPayload<object>;

export const toEngineShift = (s: ShiftRow): EngineShift => ({
  id: s.id,
  code: s.code,
  type: s.type,
  startTime: s.startTime,
  endTime: s.endTime,
  breakMinutes: s.breakMinutes,
  lateGraceMinutes: s.lateGraceMinutes,
  earlyGraceMinutes: s.earlyGraceMinutes,
  checkInBeforeMinutes: s.checkInBeforeMinutes,
  checkOutAfterMinutes: s.checkOutAfterMinutes,
  workUnits: s.workUnits.toString(),
});

/** Ký hiệu / số công hiệu lực (điều chỉnh thủ công ưu tiên). */
export const effective = (r: Pick<DailyTimesheet, 'symbol' | 'workUnits' | 'overrideSymbol' | 'overrideWorkUnits'>) => ({
  symbol: r.overrideSymbol ?? r.symbol,
  workUnits: (r.overrideWorkUnits ?? r.workUnits).toString(),
});

const monthsOf = (from: string, to: string) => [...new Set(eachDay(from, to).map((d) => d.slice(0, 7)))];

@Injectable()
export class TimesheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly queue: QueueService,
  ) {}

  // ================= TÍNH CÔNG =================

  /** Đưa yêu cầu tính lại vào hàng đợi (gộp theo nhân viên, chia lô). */
  async enqueueRecompute(items: RecomputeItem[]) {
    const merged = new Map<string, RecomputeItem>();
    for (const it of items) {
      const m = merged.get(it.employeeId);
      merged.set(it.employeeId, m ? { ...m, from: it.from < m.from ? it.from : m.from, to: it.to > m.to ? it.to : m.to } : it);
    }
    const list = [...merged.values()];
    const jobs = [];
    for (let i = 0; i < list.length; i += 200) {
      jobs.push(await this.queue.add(QUEUE_TIMESHEET, 'recompute', { items: list.slice(i, i + 200) }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }));
    }
    return jobs.map((j) => j.id);
  }

  async recompute(items: RecomputeItem[]) {
    let rows = 0;
    for (const it of items) rows += await this.recomputeEmployee(it.employeeId, it.from, it.to);
    return { employees: items.length, rows };
  }

  /** Tính lại công của một nhân viên trong khoảng ngày. Bỏ qua ngày tương lai và tháng đã chốt. */
  async recomputeEmployee(employeeId: string, from: string, to: string): Promise<number> {
    const now = new Date();
    const today = toVnDate(now);
    if (to > today) to = today;
    if (from > to) return 0;

    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, campusId: true, unitId: true, deletedAt: true } });
    if (!emp || emp.deletedAt) return 0;

    const months = monthsOf(from, to);
    const fromCol = dateColumn(from);
    const toCol = dateColumn(to);
    const [closed, schedules, punches, leaves, holidays, assignments, existing] = await Promise.all([
      this.prisma.timesheetPeriod.findMany({ where: { unitId: emp.unitId, month: { in: months }, status: 'CLOSED' }, select: { month: true } }),
      this.prisma.schedule.findMany({ where: { employeeId, date: { gte: fromCol, lte: toCol } }, include: { shift: true } }),
      this.prisma.attendancePunch.findMany({
        where: { employeeId, punchTime: { gte: vnDateTime(from, '00:00', -1), lt: vnDateTime(to, '00:00', 2) } },
        select: { punchTime: true, campusId: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { employeeId, status: 'APPROVED', fromDate: { lte: toCol }, toDate: { gte: fromCol } },
        include: { leaveType: true },
      }),
      this.prisma.holiday.findMany({ where: { date: { gte: fromCol, lte: toCol } }, select: { date: true } }),
      this.prisma.campusAssignment.findMany({ where: { employeeId, fromDate: { lte: toCol }, toDate: { gte: fromCol } } }),
      this.prisma.dailyTimesheet.findMany({ where: { employeeId, date: { gte: fromCol, lte: toCol } }, select: { id: true, date: true, slotKey: true } }),
    ]);
    const closedMonths = new Set(closed.map((c) => c.month));
    const holidaySet = new Set(holidays.map((h) => ymdOf(h.date)));
    const enginePunches = punches.map((p) => ({ time: p.punchTime, campusId: p.campusId }));

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const date of eachDay(from, to)) {
      if (closedMonths.has(date.slice(0, 7))) continue;
      const shifts = schedules.filter((s) => ymdOf(s.date) === date).map((s) => s.shift);
      const leave = leaves.find((l) => leaveSessionOn(date, ymdOf(l.fromDate), ymdOf(l.toDate), l.startSession, l.endSession));
      const assignment = assignments.find((a) => ymdOf(a.fromDate) <= date && ymdOf(a.toDate) >= date);
      const expectedCampusId = assignment?.campusId ?? emp.campusId;

      const rows = computeDay({
        date,
        shifts: shifts.map(toEngineShift),
        punches: enginePunches,
        leave: leave
          ? {
              leaveRequestId: leave.id,
              symbol: leave.leaveType.symbol,
              countsAsWork: leave.leaveType.countsAsWork,
              session: leaveSessionOn(date, ymdOf(leave.fromDate), ymdOf(leave.toDate), leave.startSession, leave.endSession)!,
            }
          : null,
        holiday: holidaySet.has(date),
        expectedCampusId,
      })
        // Ca hôm nay chưa kết thúc mà chưa quét → chưa kết luận vắng
        .filter((r) => !(date === today && r.status === 'ABSENT' && r.scheduledEnd && r.scheduledEnd > now));

      const keep = new Set(rows.map((r) => r.slotKey));
      for (const old of existing.filter((e) => ymdOf(e.date) === date && !keep.has(e.slotKey))) {
        ops.push(this.prisma.dailyTimesheet.delete({ where: { id: old.id } }));
      }
      for (const r of rows) {
        const data = {
          shiftId: r.shiftId,
          unitId: emp.unitId,
          campusId: r.campusId,
          expectedCampusId,
          status: r.status,
          symbol: r.symbol,
          workUnits: r.workUnits,
          scheduledStart: r.scheduledStart,
          scheduledEnd: r.scheduledEnd,
          firstIn: r.firstIn,
          lastOut: r.lastOut,
          workedMinutes: r.workedMinutes,
          lateMinutes: r.lateMinutes,
          earlyMinutes: r.earlyMinutes,
          isLate: r.isLate,
          isEarly: r.isEarly,
          campusMismatch: r.campusMismatch,
          leaveRequestId: r.leaveRequestId,
          computedAt: now,
        };
        ops.push(
          this.prisma.dailyTimesheet.upsert({
            where: { employeeId_date_slotKey: { employeeId, date: dateColumn(date), slotKey: r.slotKey } },
            create: { ...data, employeeId, date: dateColumn(date), slotKey: r.slotKey },
            update: data, // giữ nguyên override_* (điều chỉnh thủ công)
          }),
        );
      }
    }
    if (ops.length) await this.prisma.$transaction(ops);
    return ops.length;
  }

  /** Tính lại cả đơn vị trong tháng (qua hàng đợi). */
  async enqueueUnitMonth(actor: AuthUser, unitId: string, month: string) {
    await this.assertUnitInScope(actor, unitId);
    await this.assertNotClosed(unitId, month);
    const { from, to } = monthRange(month);
    const emps = await this.prisma.employee.findMany({ where: { unitId, deletedAt: null }, select: { id: true } });
    const jobIds = await this.enqueueRecompute(emps.map((e) => ({ employeeId: e.id, from, to })));
    return { employees: emps.length, jobIds };
  }

  async jobStatus(jobId: string) {
    const job = await this.queue.queue(QUEUE_TIMESHEET).getJob(jobId);
    if (!job) throw new NotFoundException('Không tìm thấy tác vụ');
    return { id: job.id, state: await job.getState(), result: job.returnvalue ?? null, failedReason: job.failedReason ?? null };
  }

  // ================= BẢNG CÔNG THÁNG =================

  async grid(actor: AuthUser, unitId: string, month: string) {
    await this.assertUnitInScope(actor, unitId);
    const { from, to } = monthRange(month);
    const [period, rows, holidays, campuses] = await Promise.all([
      this.prisma.timesheetPeriod.findUnique({ where: { unitId_month: { unitId, month } } }),
      this.prisma.dailyTimesheet.findMany({
        where: { unitId, date: { gte: dateColumn(from), lte: dateColumn(to) }, employee: this.employees.scope(actor) },
        include: { shift: { select: { code: true, type: true } } },
        orderBy: [{ date: 'asc' }, { scheduledStart: 'asc' }],
      }),
      this.prisma.holiday.findMany({ where: { date: { gte: dateColumn(from), lte: dateColumn(to) } } }),
      this.prisma.campus.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    const rowEmployeeIds = [...new Set(rows.map((r) => r.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: {
        AND: [this.employees.scope(actor), { OR: [{ unitId, status: { in: ACTIVE_EMPLOYEE_STATUSES } }, { id: { in: rowEmployeeIds } }] }],
      },
      select: { id: true, code: true, fullName: true, campusId: true, positionCode: true },
      orderBy: { code: 'asc' },
    });
    return {
      month,
      days: eachDay(from, to),
      holidays: holidays.map((h) => ({ date: ymdOf(h.date), name: h.name })),
      campuses,
      period: period ?? { unitId, month, status: 'OPEN' },
      employees: employees.map((e) => {
        const mine = rows.filter((r) => r.employeeId === e.id);
        return {
          ...e,
          cells: mine.map((r) => ({
            id: r.id,
            date: ymdOf(r.date),
            shiftCode: r.shift?.code ?? null,
            status: r.status,
            ...effective(r),
            computedSymbol: r.symbol,
            overridden: r.overrideSymbol !== null || r.overrideWorkUnits !== null,
            isLate: r.isLate,
            isEarly: r.isEarly,
            campusMismatch: r.campusMismatch,
          })),
          totals: aggregateMonth(mine.map((r) => this.monthRow(r))),
        };
      }),
    };
  }

  private monthRow(r: DailyTimesheet & { shift: { type: 'WORK' | 'DUTY' } | null }): MonthRowInput {
    const eff = effective(r);
    return {
      symbol: eff.symbol,
      workUnits: eff.workUnits,
      status: r.status,
      isLate: r.isLate,
      isEarly: r.isEarly,
      lateMinutes: r.lateMinutes,
      earlyMinutes: r.earlyMinutes,
      campusId: r.campusId,
      expectedCampusId: r.expectedCampusId,
      shiftType: r.shift?.type ?? null,
    };
  }

  /** Chi tiết một ô công: dòng công + các lượt quét trong ngày */
  async rowDetail(actor: AuthUser, id: string) {
    const row = await this.findRowInScope(actor, id);
    const date = ymdOf(row.date);
    const punches = await this.prisma.attendancePunch.findMany({
      where: { employeeId: row.employeeId, punchTime: { gte: vnDateTime(date, '00:00', -1), lt: vnDateTime(date, '00:00', 2) } },
      include: { device: { select: { name: true, campus: { select: { name: true } } } } },
      orderBy: { punchTime: 'asc' },
    });
    return { ...row, punches: punches.map((p) => ({ ...p, id: p.id.toString() })) };
  }

  async adjust(actor: AuthUser, id: string, input: AdjustTimesheetInput, meta: RequestMeta) {
    const before = await this.findRowInScope(actor, id);
    await this.assertNotClosed(before.unitId, ymdOf(before.date).slice(0, 7));
    const clear = input.symbol === null && input.workUnits === null;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.dailyTimesheet.update({
        where: { id },
        data: {
          overrideSymbol: input.symbol,
          overrideWorkUnits: input.workUnits,
          overrideReason: clear ? null : input.reason,
          overriddenBy: clear ? null : actor.id,
          overriddenAt: clear ? null : new Date(),
        },
      });
      await this.audit.log(
        {
          actor,
          action: clear ? 'CLEAR_ADJUST' : 'ADJUST',
          entity: 'employee.timesheet',
          entityId: before.employeeId,
          before: { date: ymdOf(before.date), ...effective(before) },
          after: { date: ymdOf(row.date), ...effective(row), reason: input.reason },
          meta,
        },
        tx,
      );
      return row;
    });
  }

  // ================= KỲ CÔNG =================

  async periods(actor: AuthUser, month: string) {
    const unitWhere = this.unitScope(actor);
    const [units, periods, stats] = await Promise.all([
      this.prisma.unit.findMany({ where: { deletedAt: null, ...unitWhere }, select: { id: true, code: true, name: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.timesheetPeriod.findMany({ where: { month } }),
      this.prisma.dailyTimesheet.groupBy({
        by: ['unitId', 'status'],
        where: { date: { gte: dateColumn(monthRange(month).from), lte: dateColumn(monthRange(month).to) } },
        _count: { _all: true },
      }),
    ]);
    return units.map((u) => {
      const p = periods.find((x) => x.unitId === u.id);
      const s = stats.filter((x) => x.unitId === u.id);
      const count = (st: string[]) => s.filter((x) => st.includes(x.status)).reduce((a, b) => a + b._count._all, 0);
      return {
        unit: u,
        status: p?.status ?? 'OPEN',
        confirmedAt: p?.confirmedAt ?? null,
        closedAt: p?.closedAt ?? null,
        rows: count(Object.keys({ PRESENT: 1, ABSENT: 1, LEAVE: 1, LEAVE_HALF: 1, HOLIDAY: 1, MISSING_IN: 1, MISSING_OUT: 1, NO_SCHEDULE: 1 })),
        pending: count(['MISSING_IN', 'MISSING_OUT', 'NO_SCHEDULE']),
        absent: count(['ABSENT']),
      };
    });
  }

  /** Đơn vị xác nhận công tháng */
  async confirm(actor: AuthUser, input: PeriodActionInput, meta: RequestMeta) {
    for (const unitId of input.unitIds) {
      await this.assertUnitInScope(actor, unitId);
      await this.assertNotClosed(unitId, input.month);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const unitId of input.unitIds) {
        await tx.timesheetPeriod.upsert({
          where: { unitId_month: { unitId, month: input.month } },
          create: { unitId, month: input.month, status: 'CONFIRMED', confirmedBy: actor.id, confirmedAt: new Date(), note: input.note },
          update: { status: 'CONFIRMED', confirmedBy: actor.id, confirmedAt: new Date(), note: input.note },
        });
        await this.audit.log({ actor, action: 'CONFIRM', entity: 'timesheet_period', entityId: `${unitId}:${input.month}`, after: input, meta }, tx);
      }
    });
    return { ok: true };
  }

  /** TCCB chốt công tháng: khóa + chụp số liệu tổng hợp làm đầu vào tính lương */
  async close(actor: AuthUser, input: PeriodActionInput, meta: RequestMeta) {
    const { from, to } = monthRange(input.month);
    for (const unitId of input.unitIds) {
      const rows = await this.prisma.dailyTimesheet.findMany({
        where: { unitId, date: { gte: dateColumn(from), lte: dateColumn(to) } },
        include: { shift: { select: { type: true } } },
      });
      const byEmployee = new Map<string, typeof rows>();
      for (const r of rows) byEmployee.set(r.employeeId, [...(byEmployee.get(r.employeeId) ?? []), r]);
      await this.prisma.$transaction(async (tx) => {
        for (const [employeeId, list] of byEmployee) {
          const totals = aggregateMonth(list.map((r) => this.monthRow(r)));
          const data = { unitId, workUnits: totals.workUnits, dutyCount: totals.dutyCount, totals: totals as unknown as Prisma.InputJsonValue, closedAt: new Date() };
          await tx.monthlyTimesheet.upsert({
            where: { employeeId_month: { employeeId, month: input.month } },
            create: { ...data, employeeId, month: input.month },
            update: data,
          });
        }
        await tx.timesheetPeriod.upsert({
          where: { unitId_month: { unitId, month: input.month } },
          create: { unitId, month: input.month, status: 'CLOSED', closedBy: actor.id, closedAt: new Date(), note: input.note },
          update: { status: 'CLOSED', closedBy: actor.id, closedAt: new Date(), note: input.note },
        });
        await this.audit.log(
          { actor, action: 'CLOSE', entity: 'timesheet_period', entityId: `${unitId}:${input.month}`, after: { employees: byEmployee.size }, meta },
          tx,
        );
      });
    }
    return { ok: true };
  }

  /** Mở lại kỳ đã chốt (trường hợp đặc biệt, có ghi nhật ký) */
  async reopen(actor: AuthUser, input: PeriodActionInput, meta: RequestMeta) {
    if (!input.note) throw new BadRequestException({ message: 'Nhập lý do mở lại', errors: { note: ['Nhập lý do mở lại'] } });
    await this.prisma.$transaction(async (tx) => {
      for (const unitId of input.unitIds) {
        await tx.timesheetPeriod.updateMany({ where: { unitId, month: input.month }, data: { status: 'OPEN', note: input.note } });
        await this.audit.log({ actor, action: 'REOPEN', entity: 'timesheet_period', entityId: `${unitId}:${input.month}`, after: input, meta }, tx);
      }
    });
    return { ok: true };
  }

  // ================= CÁ NHÂN =================

  async myMonth(actor: AuthUser, month: string) {
    const emp = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, select: { id: true, code: true, fullName: true } });
    if (!emp) return null;
    const { from, to } = monthRange(month);
    const rows = await this.prisma.dailyTimesheet.findMany({
      where: { employeeId: emp.id, date: { gte: dateColumn(from), lte: dateColumn(to) } },
      include: { shift: { select: { code: true, name: true, type: true } } },
      orderBy: [{ date: 'asc' }, { scheduledStart: 'asc' }],
    });
    return {
      employee: emp,
      rows: rows.map((r) => ({ ...r, ...effective(r), date: ymdOf(r.date) })),
      totals: aggregateMonth(rows.map((r) => this.monthRow(r))),
    };
  }

  // ================= PHẠM VI =================

  /** Điều kiện đơn vị theo phạm vi dữ liệu */
  unitScope(actor: AuthUser): Prisma.UnitWhereInput {
    if (actor.dataScope === 'ALL') return {};
    if (actor.dataScope === 'CAMPUS') return { OR: [{ campusId: actor.campusId }, { campusId: null }] };
    const ids = [...actor.managedUnitIds, ...(actor.unitId ? [actor.unitId] : [])];
    return { id: { in: ids } };
  }

  async assertUnitInScope(actor: AuthUser, unitId: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, deletedAt: null, ...this.unitScope(actor) } });
    if (!unit) throw new ForbiddenException('Đơn vị ngoài phạm vi quản lý của bạn');
    return unit;
  }

  async assertNotClosed(unitId: string, month: string) {
    const p = await this.prisma.timesheetPeriod.findUnique({ where: { unitId_month: { unitId, month } } });
    if (p?.status === 'CLOSED') throw new BadRequestException(`Công tháng ${month.split('-').reverse().join('/')} của đơn vị đã chốt`);
  }

  private async findRowInScope(actor: AuthUser, id: string) {
    const row = await this.prisma.dailyTimesheet.findFirst({ where: { id, employee: this.employees.scope(actor) } });
    if (!row) throw new NotFoundException('Không tìm thấy dòng công');
    return row;
  }
}
