import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import { addDays, toVnDate, vnDateTime, ymdOf, type ListPunchesQuery } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../hr/employees.service';
import { TimesheetService } from './timesheet.service';

@Injectable()
export class PunchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly timesheet: TimesheetService,
  ) {}

  private where(actor: AuthUser, q: ListPunchesQuery): Prisma.AttendancePunchWhereInput {
    const from = q.from ? vnDateTime(ymdOf(q.from), '00:00') : undefined;
    const to = q.to ? vnDateTime(ymdOf(q.to), '00:00', 1) : undefined;
    return {
      punchTime: from || to ? { gte: from, lt: to } : undefined,
      deviceId: q.deviceId,
      campusId: q.campusId,
      employeeId: q.unmapped ? null : q.employeeId,
      // Lượt quét chưa gắn nhân viên chỉ người quản lý máy xem được
      ...(q.unmapped
        ? {}
        : {
            employee: {
              ...this.employees.scope(actor),
              unitId: q.unitId,
              ...(q.search ? { searchText: { contains: q.search.toLowerCase() } } : {}),
            },
          }),
    };
  }

  async list(actor: AuthUser, q: ListPunchesQuery, all = false) {
    const where = this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendancePunch.findMany({
        where,
        include: {
          device: { select: { code: true, name: true } },
          employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } },
        },
        orderBy: { punchTime: 'desc' },
        ...(all ? { skip: 0, take: 50_000 } : toSkipTake(q)),
      }),
      this.prisma.attendancePunch.count({ where }),
    ]);
    return paginated(items.map((p) => ({ ...p, id: p.id.toString() })), total, q);
  }

  /** Mã chấm công trên máy chưa gắn với hồ sơ nào */
  async unmappedSummary() {
    const rows = await this.prisma.attendancePunch.groupBy({
      by: ['employeeNo'],
      where: { employeeId: null },
      _count: { _all: true },
      _max: { punchTime: true, personName: true },
      orderBy: { _max: { punchTime: 'desc' } },
      take: 500,
    });
    return rows.map((r) => ({ employeeNo: r.employeeNo, count: r._count._all, lastPunch: r._max.punchTime, personName: r._max.personName }));
  }

  /** Gắn mã chấm công cho nhân viên → cập nhật các lượt quét cũ và tính lại công */
  async mapEmployeeNo(actor: AuthUser, employeeNo: string, employeeId: string, meta: RequestMeta) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, ...this.employees.scope(actor) } });
    if (!emp) throw new NotFoundException('Không tìm thấy nhân viên');
    const taken = await this.prisma.employee.findFirst({ where: { attendanceCode: employeeNo, id: { not: employeeId } } });
    if (taken) throw new BadRequestException(`Mã chấm công ${employeeNo} đã gắn cho ${taken.code} — ${taken.fullName}`);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data: { attendanceCode: employeeNo, updatedBy: actor.id } });
      const r = await this.backfill(employeeNo, employeeId, tx);
      await this.audit.log(
        { actor, action: 'MAP_ATTENDANCE_CODE', entity: 'employee', entityId: employeeId, before: { attendanceCode: emp.attendanceCode }, after: { attendanceCode: employeeNo, punches: r }, meta },
        tx,
      );
      return r;
    });
    return { punches: updated };
  }

  /** Gắn employeeId cho lượt quét theo mã chấm công và xếp hàng tính lại công các ngày liên quan */
  async backfill(employeeNo: string, employeeId: string, tx: Prisma.TransactionClient = this.prisma) {
    const range = await tx.attendancePunch.aggregate({
      where: { employeeNo, employeeId: null },
      _min: { punchTime: true },
      _max: { punchTime: true },
    });
    const r = await tx.attendancePunch.updateMany({ where: { employeeNo, employeeId: null }, data: { employeeId } });
    if (r.count && range._min.punchTime && range._max.punchTime) {
      await this.timesheet.enqueueRecompute([
        { employeeId, from: addDays(toVnDate(range._min.punchTime), -1), to: toVnDate(range._max.punchTime) },
      ]);
    }
    return r.count;
  }

  /** Lượt quét hôm nay theo giờ (dashboard) */
  async todayByHour(campusId?: string) {
    const today = toVnDate(new Date());
    const rows = await this.prisma.attendancePunch.findMany({
      where: { punchTime: { gte: vnDateTime(today, '00:00'), lt: vnDateTime(today, '00:00', 1) }, campusId },
      select: { punchTime: true },
    });
    const hours = Array.from({ length: 24 }, () => 0);
    for (const r of rows) hours[Number(new Date(r.punchTime.getTime() + 7 * 3_600_000).toISOString().slice(11, 13))]++;
    return { date: today, total: rows.length, hours };
  }

}
