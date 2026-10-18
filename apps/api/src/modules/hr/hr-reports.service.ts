import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import type { BulkAssignmentInput, HrReportQuery, ListAssignmentsQuery } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from './employees.service';

const EMPLOYEE_REF = {
  select: { id: true, code: true, fullName: true, unit: { select: { id: true, name: true } }, campus: { select: { id: true, name: true } } },
};

const dayUTC = (offsetDays = 0) => {
  const now = new Date(Date.now() + 7 * 3_600_000); // giờ Việt Nam
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
};

/** Báo cáo tổng hợp xuyên hồ sơ — luôn giới hạn theo phạm vi dữ liệu của người xem. */
@Injectable()
export class HrReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  private employeeFilter(actor: AuthUser, q: { campusId?: string; unitId?: string }): Prisma.EmployeeWhereInput {
    return { ...this.employees.scope(actor), campusId: q.campusId, unitId: q.unitId };
  }

  async trainings(actor: AuthUser, q: HrReportQuery, all = false) {
    const where: Prisma.EmployeeTrainingWhereInput = {
      employee: this.employeeFilter(actor, q),
      trainingTypeCode: q.typeCode,
      ...(q.year ? { toDate: { gte: new Date(Date.UTC(q.year, 0, 1)), lt: new Date(Date.UTC(q.year + 1, 0, 1)) } } : {}),
      ...(q.expiringWithinDays !== undefined ? { expiryDate: { gte: dayUTC(), lte: dayUTC(q.expiringWithinDays) } } : {}),
    };
    return this.page(q, all, where, this.prisma.employeeTraining, [{ expiryDate: 'asc' }, { toDate: 'desc' }]);
  }

  async rewards(actor: AuthUser, q: HrReportQuery, all = false) {
    const where: Prisma.EmployeeRewardWhereInput = { employee: this.employeeFilter(actor, q), formCode: q.typeCode, year: q.year };
    return this.page(q, all, where, this.prisma.employeeReward, [{ year: 'desc' }, { decisionDate: 'desc' }]);
  }

  async disciplines(actor: AuthUser, q: HrReportQuery, all = false) {
    const where: Prisma.EmployeeDisciplineWhereInput = {
      employee: this.employeeFilter(actor, q),
      formCode: q.typeCode,
      ...(q.year ? { effectiveFrom: { gte: new Date(Date.UTC(q.year, 0, 1)), lt: new Date(Date.UTC(q.year + 1, 0, 1)) } } : {}),
    };
    return this.page(q, all, where, this.prisma.employeeDiscipline, [{ effectiveFrom: 'desc' }]);
  }

  /** Hợp đồng sắp hết hạn trong N ngày (mặc định 60). */
  async expiringContracts(actor: AuthUser, q: HrReportQuery, all = false) {
    const where: Prisma.EmployeeContractWhereInput = {
      employee: { ...this.employeeFilter(actor, q), status: { in: ['WORKING', 'PROBATION'] } },
      endDate: { gte: dayUTC(), lte: dayUTC(q.expiringWithinDays ?? 60) },
    };
    return this.page(q, all, where, this.prisma.employeeContract, [{ endDate: 'asc' }]);
  }

  /** Phân công làm việc tại cơ sở — lọc theo tháng (giao với tháng) và cơ sở được phân công. */
  async assignments(actor: AuthUser, q: ListAssignmentsQuery, all = false) {
    let range: Prisma.CampusAssignmentWhereInput = {};
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      range = { fromDate: { lt: new Date(Date.UTC(y, m, 1)) }, toDate: { gte: new Date(Date.UTC(y, m - 1, 1)) } };
    }
    const where: Prisma.CampusAssignmentWhereInput = {
      employee: { ...this.employees.scope(actor), unitId: q.unitId },
      campusId: q.campusId,
      ...range,
    };
    const include = { employee: EMPLOYEE_REF, campus: { select: { id: true, name: true } }, unit: { select: { id: true, name: true } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campusAssignment.findMany({ where, include, orderBy: [{ fromDate: 'desc' }], ...(all ? { skip: 0, take: 20_000 } : toSkipTake(q)) }),
      this.prisma.campusAssignment.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  /** Phân công nhiều nhân viên cùng lúc — tất cả hoặc không: báo đủ danh sách trùng lịch. */
  async bulkAssign(actor: AuthUser, input: BulkAssignmentInput, meta: RequestMeta) {
    if (!actor.permissions.has('hr.assignment.manage')) throw new ForbiddenException();
    if (input.toDate < input.fromDate) throw new BadRequestException('Đến ngày phải sau từ ngày');
    const ids = [...new Set(input.employeeIds)];
    const emps = await this.prisma.employee.findMany({ where: { id: { in: ids }, ...this.employees.scope(actor) }, select: { id: true, code: true, fullName: true } });
    if (emps.length !== ids.length) throw new BadRequestException('Có nhân viên không tồn tại hoặc ngoài phạm vi quản lý');
    const clashes = await this.prisma.campusAssignment.findMany({
      where: { employeeId: { in: ids }, fromDate: { lte: input.toDate }, toDate: { gte: input.fromDate } },
      select: { employeeId: true },
    });
    if (clashes.length) {
      const names = emps.filter((e) => clashes.some((c) => c.employeeId === e.id)).map((e) => `${e.code} ${e.fullName}`);
      throw new BadRequestException(`Trùng thời gian phân công: ${names.join(', ')}`);
    }
    const { employeeIds: _ids, ...data } = input;
    await this.prisma.$transaction(async (tx) => {
      await tx.campusAssignment.createMany({
        data: ids.map((employeeId) => ({ ...data, unitId: data.unitId ?? null, employeeId, createdBy: actor.id, updatedBy: actor.id })),
      });
      for (const employeeId of ids) {
        await this.audit.log({ actor, action: 'CREATE', entity: 'employee.assignments', entityId: employeeId, after: data, meta }, tx);
      }
    });
    return { created: ids.length };
  }

  private async page<W>(
    q: HrReportQuery,
    all: boolean,
    where: W,
    delegate: { findMany(a: unknown): Promise<unknown[]>; count(a: unknown): Promise<number> },
    orderBy: unknown,
  ) {
    const [items, total] = await Promise.all([
      delegate.findMany({ where, include: { employee: EMPLOYEE_REF }, orderBy, ...(all ? { take: 20_000 } : toSkipTake(q)) }),
      delegate.count({ where }),
    ]);
    return paginated(items as Record<string, unknown>[], total, q);
  }
}
