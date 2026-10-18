import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import {
  Money,
  dateColumn,
  isOvernight,
  leaveSessionOn,
  monthRange,
  roundVnd,
  toVnDate,
  vnDateTime,
  ymdOf,
  type AttendanceReportQuery,
} from '@bachmai/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from '../hr/employees.service';
import { deviceHealth } from './devices.service';
import { PunchesService } from './punches.service';
import { ShiftsService } from './shifts.service';
import { effective } from './timesheet.service';

const EMP = { select: { id: true, code: true, fullName: true, unit: { select: { id: true, name: true } } } } as const;

@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly shifts: ShiftsService,
    private readonly punches: PunchesService,
  ) {}

  private range(q: AttendanceReportQuery) {
    if (q.month) {
      const r = monthRange(q.month);
      return { from: dateColumn(r.from), to: dateColumn(r.to) };
    }
    const today = toVnDate(new Date());
    return { from: q.from ?? dateColumn(`${today.slice(0, 7)}-01`), to: q.to ?? dateColumn(today) };
  }

  private rowWhere(actor: AuthUser, q: AttendanceReportQuery): Prisma.DailyTimesheetWhereInput {
    const { from, to } = this.range(q);
    return {
      date: { gte: from, lte: to },
      unitId: q.unitId,
      expectedCampusId: q.campusId,
      employeeId: q.employeeId,
      employee: this.employees.scope(actor),
    };
  }

  /** Đi muộn, về sớm */
  async lateEarly(actor: AuthUser, q: AttendanceReportQuery, all = false) {
    const where: Prisma.DailyTimesheetWhereInput = { ...this.rowWhere(actor, q), OR: [{ isLate: true }, { isEarly: true }] };
    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.dailyTimesheet.findMany({
        where,
        include: { employee: EMP, shift: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { lateMinutes: 'desc' }],
        ...(all ? { skip: 0, take: 50_000 } : toSkipTake(q)),
      }),
      this.prisma.dailyTimesheet.count({ where }),
      this.prisma.dailyTimesheet.aggregate({ where, _sum: { lateMinutes: true, earlyMinutes: true } }),
    ]);
    return {
      ...paginated(items.map((r) => ({ ...r, date: ymdOf(r.date) })), total, q),
      summary: { lateMinutes: summary._sum.lateMinutes ?? 0, earlyMinutes: summary._sum.earlyMinutes ?? 0 },
    };
  }

  /** Báo cáo trực + tiền trực theo nhân viên. Tiền = mức tiền trực hiệu lực tại ngày trực × (công thực tế / công của ca). */
  async duty(actor: AuthUser, q: AttendanceReportQuery) {
    const rows = await this.prisma.dailyTimesheet.findMany({
      where: { ...this.rowWhere(actor, q), shift: { type: 'DUTY' } },
      include: { employee: EMP, shift: true },
      orderBy: [{ date: 'asc' }],
    });
    const rateAt = await this.shifts.rateResolver();
    const byEmployee = new Map<string, { employee: (typeof rows)[number]['employee']; count: number; units: InstanceType<typeof Money>; amount: InstanceType<typeof Money>; missingRate: number; details: unknown[] }>();
    for (const r of rows) {
      const eff = effective(r);
      const units = new Money(eff.workUnits);
      if (units.lte(0)) continue;
      const date = ymdOf(r.date);
      const rate = rateAt(r.shiftId!, date);
      const amount = rate ? new Money(rate).times(units).div(r.shift!.workUnits.toString()) : new Money(0);
      const e = byEmployee.get(r.employeeId) ?? { employee: r.employee, count: 0, units: new Money(0), amount: new Money(0), missingRate: 0, details: [] };
      e.count++;
      e.units = e.units.plus(units);
      e.amount = e.amount.plus(amount);
      if (!rate) e.missingRate++;
      e.details.push({ date, shiftCode: r.shift!.code, symbol: eff.symbol, units: units.toFixed(2), rate, amount: roundVnd(amount).toFixed(0) });
      byEmployee.set(r.employeeId, e);
    }
    const items = [...byEmployee.values()]
      .map((e) => ({ ...e, units: e.units.toFixed(2), amount: roundVnd(e.amount).toFixed(0) }))
      .sort((a, b) => a.employee.code.localeCompare(b.employee.code));
    const total = items.reduce((s, e) => s.plus(e.amount), new Money(0));
    return { items, total: roundVnd(total).toFixed(0), dutyCount: items.reduce((s, e) => s + e.count, 0), missingRate: items.some((e) => e.missingRate > 0) };
  }

  /** Dashboard hôm nay — tính trực tiếp từ lịch + lượt quét + phiếu nghỉ (không chờ job tính công) */
  async dashboard(actor: AuthUser, campusId?: string) {
    const now = new Date();
    const today = toVnDate(now);
    const day = dateColumn(today);
    const empScope: Prisma.EmployeeWhereInput = { ...this.employees.scope(actor), ...(campusId ? { campusId } : {}) };

    const [schedules, leaves, devices, unmapped, pendingLeaves, byHour] = await Promise.all([
      this.prisma.schedule.findMany({ where: { date: day, employee: empScope }, include: { shift: true, employee: { select: { id: true, unitId: true } } } }),
      this.prisma.leaveRequest.findMany({ where: { status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day }, employee: empScope } }),
      this.prisma.attendanceDevice.findMany({ where: { deletedAt: null, ...(campusId ? { campusId } : {}) }, include: { campus: { select: { name: true } } } }),
      this.prisma.attendancePunch.count({ where: { employeeId: null } }),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING', employee: empScope } }),
      this.punches.todayByHour(campusId),
    ]);
    const empIds = [...new Set(schedules.map((s) => s.employeeId))];
    const punches = empIds.length
      ? await this.prisma.attendancePunch.findMany({
          where: { employeeId: { in: empIds }, punchTime: { gte: vnDateTime(today, '00:00', -1), lt: vnDateTime(today, '00:00', 1) } },
          select: { employeeId: true, punchTime: true },
        })
      : [];

    const stat = { scheduled: empIds.length, present: 0, late: 0, onLeave: 0, notYet: 0, absent: 0 };
    const lateList: { employeeId: string; shiftCode: string; firstIn: Date; lateMinutes: number }[] = [];
    for (const employeeId of empIds) {
      const mine = schedules.filter((s) => s.employeeId === employeeId).sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime));
      const leave = leaves.find((l) => l.employeeId === employeeId && leaveSessionOn(today, ymdOf(l.fromDate), ymdOf(l.toDate), l.startSession, l.endSession) === 'FULL');
      if (leave) {
        stat.onLeave++;
        continue;
      }
      const s = mine[0].shift;
      const start = vnDateTime(today, s.startTime);
      const end = vnDateTime(today, s.endTime, isOvernight(s.startTime, s.endTime) ? 1 : 0);
      const first = punches
        .filter((p) => p.employeeId === employeeId && p.punchTime.getTime() >= start.getTime() - s.checkInBeforeMinutes * 60_000 && p.punchTime <= end)
        .sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime())[0];
      if (first) {
        stat.present++;
        const late = Math.round((first.punchTime.getTime() - start.getTime()) / 60_000);
        if (late > s.lateGraceMinutes) {
          stat.late++;
          lateList.push({ employeeId, shiftCode: s.code, firstIn: first.punchTime, lateMinutes: late });
        }
      } else if (now.getTime() < start.getTime() + s.lateGraceMinutes * 60_000) stat.notYet++;
      else stat.absent++;
    }
    const lateEmployees = lateList.length
      ? await this.prisma.employee.findMany({ where: { id: { in: lateList.map((l) => l.employeeId) } }, select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } })
      : [];

    return {
      date: today,
      stat,
      late: lateList
        .sort((a, b) => b.lateMinutes - a.lateMinutes)
        .slice(0, 20)
        .map((l) => ({ ...l, employee: lateEmployees.find((e) => e.id === l.employeeId) })),
      devices: devices.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        campus: d.campus.name,
        health: deviceHealth(d, now),
        lastSuccessAt: d.lastSuccessAt,
        lastError: d.lastError,
        clockOffsetSeconds: d.clockOffsetSeconds,
      })),
      unmappedPunches: unmapped,
      pendingLeaves,
      punchesByHour: byHour,
    };
  }
}
