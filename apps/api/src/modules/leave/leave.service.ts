import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  Money,
  annualLeaveEntitlement,
  dateColumn,
  leaveDays,
  normalizeSearch,
  ymdOf,
  type CreateLeaveRequestInput,
  type CreateLeaveTypeInput,
  type HalfDay,
  type LeaveBalanceQuery,
  type ListLeaveRequestsQuery,
  type UpdateLeaveBalanceInput,
  type UpdateLeaveTypeInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService, APPROVAL_COMPLETED_EVENT, type ApprovalCompletedEvent } from '../approvals/approvals.service';
import { TimesheetService } from '../attendance/timesheet.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { EMPLOYEE_FILE_OWNER, EmployeesService } from '../hr/employees.service';
import { PolicyService } from '../policy/policy.service';

const fmt = (d: Date) => ymdOf(d).split('-').reverse().join('/');

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly approvals: ApprovalsService,
    private readonly files: FilesService,
    private readonly timesheet: TimesheetService,
    private readonly policy: PolicyService,
  ) {}

  // ================= LOẠI PHIẾU =================

  types(includeInactive = false) {
    return this.prisma.leaveType.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  async createType(actor: AuthUser, input: CreateLeaveTypeInput, meta: RequestMeta) {
    await this.assertWorkflow(input.workflowCode);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.leaveType.create({ data: { ...input, createdBy: actor.id, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'leave_type', entityId: t.id, after: t, meta }, tx);
      return t;
    });
  }

  async updateType(actor: AuthUser, id: string, input: UpdateLeaveTypeInput, meta: RequestMeta) {
    const before = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy loại phiếu');
    if (input.workflowCode) await this.assertWorkflow(input.workflowCode);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.leaveType.update({ where: { id }, data: { ...input, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'leave_type', entityId: id, before, after: t, meta }, tx);
      return t;
    });
  }

  private async assertWorkflow(code: string) {
    const wf = await this.prisma.approvalWorkflow.findUnique({ where: { code } });
    if (!wf || wf.targetType !== 'LEAVE_REQUEST') {
      throw new BadRequestException({ message: 'Quy trình duyệt không hợp lệ', errors: { workflowCode: ['Chọn quy trình áp dụng cho phiếu nghỉ'] } });
    }
  }

  // ================= PHIẾU =================

  async previewDays(from: string, to: string, startSession: HalfDay, endSession: HalfDay) {
    const holidays = await this.holidaySet(from, to);
    return { days: leaveDays(from, to, startSession, endSession, holidays) };
  }

  private async holidaySet(from: string, to: string) {
    const rows = await this.prisma.holiday.findMany({ where: { date: { gte: dateColumn(from), lte: dateColumn(to) } } });
    return new Set(rows.map((h) => ymdOf(h.date)));
  }

  async create(actor: AuthUser, input: CreateLeaveRequestInput, meta: RequestMeta) {
    const emp = await this.prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
    if (!emp) throw new NotFoundException('Không tìm thấy nhân viên');
    const isSelf = emp.userId === actor.id;
    if (isSelf) {
      if (!actor.permissions.has('self.leave.create') && !actor.permissions.has('leave.request.create')) throw new ForbiddenException();
    } else {
      if (!actor.permissions.has('leave.request.create')) throw new ForbiddenException('Bạn không có quyền tạo phiếu cho người khác');
      const inScope = await this.prisma.employee.findFirst({ where: { id: emp.id, ...this.employees.scope(actor) } });
      if (!inScope) throw new ForbiddenException('Nhân viên ngoài phạm vi quản lý');
    }

    const type = await this.prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, isActive: true } });
    if (!type) throw new BadRequestException('Loại phiếu không hợp lệ');
    if (type.requiresAttachment && !input.fileId) {
      throw new BadRequestException({ message: `${type.name} cần đính kèm giấy tờ`, errors: { fileId: ['Đính kèm giấy tờ'] } });
    }
    const from = ymdOf(input.fromDate);
    const to = ymdOf(input.toDate);
    const days = leaveDays(from, to, input.startSession, input.endSession, await this.holidaySet(from, to));
    if (days <= 0) throw new BadRequestException('Khoảng thời gian không có ngày nghỉ hợp lệ (trùng ngày lễ?)');
    if (type.maxDaysPerRequest && days > type.maxDaysPerRequest) throw new BadRequestException(`${type.name} tối đa ${type.maxDaysPerRequest} ngày mỗi phiếu`);

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { employeeId: emp.id, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: input.toDate }, toDate: { gte: input.fromDate } },
    });
    if (overlap) throw new BadRequestException(`Trùng thời gian với phiếu ${overlap.code} (${fmt(overlap.fromDate)} – ${fmt(overlap.toDate)})`);

    if (type.deductAnnualLeave) {
      const year = Number(from.slice(0, 4));
      const b = await this.balanceFor(emp.id, year);
      if (new Money(b.remaining).minus(b.pending).lt(days)) {
        throw new BadRequestException(`Quỹ phép năm ${year} còn ${b.remaining} ngày (đang chờ duyệt ${b.pending}) — không đủ ${days} ngày`);
      }
    }

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const code = await this.nextCode(tx, from.slice(0, 4));
          const leave = await tx.leaveRequest.create({
            data: {
              code,
              employeeId: emp.id,
              leaveTypeId: type.id,
              fromDate: input.fromDate,
              toDate: input.toDate,
              startSession: input.startSession,
              endSession: input.endSession,
              days,
              reason: input.reason,
              destination: input.destination ?? null,
              fileId: input.fileId ?? null,
              unitId: emp.unitId,
              campusId: emp.campusId,
              createdBy: actor.id,
            },
          });
          await this.files.attach([input.fileId], EMPLOYEE_FILE_OWNER, emp.id, actor, tx);
          const req = await this.approvals.submit(
            actor,
            {
              workflowCode: type.workflowCode,
              targetType: 'LEAVE_REQUEST',
              targetId: leave.id,
              title: `${type.name} — ${emp.fullName} (${fmt(input.fromDate)}${from !== to ? ` – ${fmt(input.toDate)}` : ''})`,
              content: `Mã NV: ${emp.code}\nSố ngày: ${days}\nLý do: ${input.reason}${input.destination ? `\nNơi đến: ${input.destination}` : ''}`,
              unitId: emp.unitId,
              campusId: emp.campusId,
              selectedApprovers: input.selectedApprovers,
            },
            meta,
            tx,
          );
          const saved = await tx.leaveRequest.update({ where: { id: leave.id }, data: { approvalRequestId: req.id } });
          await this.audit.log({ actor, action: 'CREATE', entity: 'leave_request', entityId: leave.id, after: saved, meta }, tx);
          return saved;
        });
      } catch (e) {
        // Trùng số phiếu khi hai người tạo cùng lúc → thử lại
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  private async nextCode(tx: Prisma.TransactionClient, year: string) {
    const prefix = `NP-${year}-`;
    const last = await tx.leaveRequest.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } });
    const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(6, '0')}`;
  }

  private where(actor: AuthUser, q: ListLeaveRequestsQuery): Prisma.LeaveRequestWhereInput {
    const search = normalizeSearch(q.search);
    const base: Prisma.LeaveRequestWhereInput = {
      status: q.status,
      leaveTypeId: q.leaveTypeId,
      unitId: q.unitId,
      campusId: q.campusId,
      employeeId: q.employeeId,
      ...(q.from || q.to ? { fromDate: q.to ? { lte: q.to } : undefined, toDate: q.from ? { gte: q.from } : undefined } : {}),
      ...(search ? { OR: [{ code: { contains: q.search!.toUpperCase() } }, { employee: { searchText: { contains: search } } }] } : {}),
    };
    if (q.mine) return { ...base, OR: [{ createdBy: actor.id }, { employee: { userId: actor.id } }] };
    if (!actor.permissions.has('leave.request.create') && !actor.permissions.has('leave.request.approve')) {
      return { ...base, employee: { userId: actor.id } };
    }
    return { ...base, employee: this.employees.scope(actor) };
  }

  async list(actor: AuthUser, q: ListLeaveRequestsQuery) {
    const where = this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } },
          leaveType: { select: { code: true, name: true, symbol: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async get(actor: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, OR: [this.where(actor, { page: 1, pageSize: 1 }), { createdBy: actor.id }, { employee: { userId: actor.id } }] },
      include: {
        employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } },
        leaveType: true,
      },
    });
    if (!leave) throw new NotFoundException('Không tìm thấy phiếu');
    const approval = leave.approvalRequestId
      ? await this.prisma.approvalRequest.findUnique({
          where: { id: leave.approvalRequestId },
          include: {
            actions: { orderBy: { id: 'asc' } },
            assignees: { include: { user: { select: { id: true, fullName: true } } } },
          },
        })
      : null;
    return {
      ...leave,
      approval: approval && {
        id: approval.id,
        status: approval.status,
        currentStep: approval.currentStep,
        steps: (approval.stepsSnapshot as unknown as { steps: { stepOrder: number; name: string }[] }).steps.map((s) => ({
          ...s,
          assignees: approval.assignees.filter((a) => a.stepOrder === s.stepOrder).map((a) => a.user),
        })),
        actions: approval.actions.map((a) => ({ ...a, id: a.id.toString() })),
      },
    };
  }

  /**
   * Hủy phiếu: đang chờ duyệt → người gửi hủy (qua quy trình duyệt);
   * đã duyệt → cần quyền quản lý nghỉ (TCCB), bảng công được tính lại.
   */
  async cancel(actor: AuthUser, id: string, reason: string | undefined, meta: RequestMeta) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Không tìm thấy phiếu');
    if (leave.status === 'PENDING') {
      if (!leave.approvalRequestId) throw new BadRequestException('Phiếu không có quy trình duyệt');
      await this.approvals.cancel(actor, leave.approvalRequestId, meta);
      return this.prisma.leaveRequest.findUnique({ where: { id } });
    }
    if (leave.status !== 'APPROVED') throw new BadRequestException('Phiếu đã kết thúc');
    if (!actor.permissions.has('leave.type.manage')) throw new ForbiddenException('Chỉ Phòng TCCB hủy được phiếu đã duyệt');
    const inScope = await this.prisma.employee.findFirst({ where: { id: leave.employeeId, ...this.employees.scope(actor) } });
    if (!inScope) throw new ForbiddenException();
    if (!reason) throw new BadRequestException({ message: 'Nhập lý do hủy', errors: { reason: ['Nhập lý do hủy'] } });
    const saved = await this.prisma.$transaction(async (tx) => {
      const r = await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
      await this.audit.log({ actor, action: 'CANCEL', entity: 'leave_request', entityId: id, before: leave, after: { status: 'CANCELLED', reason }, meta }, tx);
      return r;
    });
    await this.timesheet.enqueueRecompute([{ employeeId: leave.employeeId, from: ymdOf(leave.fromDate), to: ymdOf(leave.toDate) }]);
    return saved;
  }

  /** Quy trình duyệt kết thúc → cập nhật phiếu, tính lại công */
  @OnEvent(APPROVAL_COMPLETED_EVENT, { async: true })
  async onApprovalCompleted(e: ApprovalCompletedEvent) {
    if (e.targetType !== 'LEAVE_REQUEST') return;
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id: e.targetId } });
    if (!leave || leave.status !== 'PENDING') return;
    await this.prisma.leaveRequest.update({ where: { id: leave.id }, data: { status: e.status, decidedAt: new Date() } });
    if (e.status === 'APPROVED') {
      await this.timesheet.enqueueRecompute([{ employeeId: leave.employeeId, from: ymdOf(leave.fromDate), to: ymdOf(leave.toDate) }]);
    }
  }

  // ================= QUỸ PHÉP NĂM =================

  private async baseDays(year: number) {
    try {
      return Number(await this.policy.valueAt('ANNUAL_LEAVE_BASE_DAYS', new Date(Date.UTC(year, 0, 1))));
    } catch {
      return 12;
    }
  }

  private async usedDays(employeeIds: string[], year: number) {
    const rows = await this.prisma.leaveRequest.groupBy({
      by: ['employeeId', 'status'],
      where: {
        employeeId: { in: employeeIds },
        status: { in: ['APPROVED', 'PENDING'] },
        leaveType: { deductAnnualLeave: true },
        fromDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      _sum: { days: true },
    });
    const get = (id: string, st: string) => rows.find((r) => r.employeeId === id && r.status === st)?._sum.days?.toString() ?? '0';
    return { approved: (id: string) => get(id, 'APPROVED'), pending: (id: string) => get(id, 'PENDING') };
  }

  async balanceFor(employeeId: string, year: number) {
    const emp = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { startDate: true } });
    const row = await this.prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
    const used = await this.usedDays([employeeId], year);
    const entitled = row ? row.entitledDays.toString() : String(annualLeaveEntitlement(await this.baseDays(year), emp.startDate ? ymdOf(emp.startDate) : null, year));
    const total = new Money(entitled).plus(row?.carriedOverDays.toString() ?? 0).plus(row?.adjustmentDays.toString() ?? 0);
    return {
      entitled,
      carriedOver: row?.carriedOverDays.toString() ?? '0',
      adjustment: row?.adjustmentDays.toString() ?? '0',
      used: used.approved(employeeId),
      pending: used.pending(employeeId),
      remaining: total.minus(used.approved(employeeId)).toString(),
    };
  }

  async myBalance(actor: AuthUser, year: number) {
    const emp = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, select: { id: true } });
    return emp ? this.balanceFor(emp.id, year) : null;
  }

  async balances(actor: AuthUser, q: LeaveBalanceQuery) {
    const search = normalizeSearch(q.search);
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        this.employees.scope(actor),
        { status: { in: ACTIVE_EMPLOYEE_STATUSES }, unitId: q.unitId, campusId: q.campusId },
        search ? { searchText: { contains: search } } : {},
      ],
    };
    const [emps, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: { id: true, code: true, fullName: true, startDate: true, unit: { select: { name: true } }, leaveBalances: { where: { year: q.year } } },
        orderBy: { code: 'asc' },
        ...toSkipTake(q),
      }),
      this.prisma.employee.count({ where }),
    ]);
    const base = await this.baseDays(q.year);
    const used = await this.usedDays(emps.map((e) => e.id), q.year);
    const items = emps.map(({ leaveBalances, startDate, ...e }) => {
      const row = leaveBalances[0];
      const entitled = row ? row.entitledDays.toString() : String(annualLeaveEntitlement(base, startDate ? ymdOf(startDate) : null, q.year));
      const total = new Money(entitled).plus(row?.carriedOverDays.toString() ?? 0).plus(row?.adjustmentDays.toString() ?? 0);
      return {
        ...e,
        balanceId: row?.id ?? null,
        year: q.year,
        entitled,
        carriedOver: row?.carriedOverDays.toString() ?? '0',
        adjustment: row?.adjustmentDays.toString() ?? '0',
        note: row?.note ?? null,
        used: used.approved(e.id),
        pending: used.pending(e.id),
        remaining: total.minus(used.approved(e.id)).toString(),
        initialized: !!row,
      };
    });
    return paginated(items, total, q);
  }

  /** Khởi tạo quỹ phép năm cho các nhân viên chưa có (tính theo thâm niên) */
  async initBalances(actor: AuthUser, year: number, meta: RequestMeta) {
    const emps = await this.prisma.employee.findMany({
      where: { AND: [this.employees.scope(actor), { status: { in: ACTIVE_EMPLOYEE_STATUSES } }] },
      select: { id: true, startDate: true },
    });
    const base = await this.baseDays(year);
    const r = await this.prisma.leaveBalance.createMany({
      data: emps.map((e) => ({
        employeeId: e.id,
        year,
        entitledDays: annualLeaveEntitlement(base, e.startDate ? ymdOf(e.startDate) : null, year),
        createdBy: actor.id,
        updatedBy: actor.id,
      })),
      skipDuplicates: true,
    });
    await this.audit.log({ actor, action: 'INIT_LEAVE_BALANCE', entity: 'leave_balance', entityId: String(year), after: { created: r.count, baseDays: base }, meta });
    return { created: r.count };
  }

  async updateBalance(actor: AuthUser, employeeId: string, year: number, input: UpdateLeaveBalanceInput, meta: RequestMeta) {
    const inScope = await this.prisma.employee.findFirst({ where: { id: employeeId, ...this.employees.scope(actor) }, select: { startDate: true } });
    if (!inScope) throw new NotFoundException('Không tìm thấy nhân viên');
    const before = await this.prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
    const entitled = input.entitledDays ?? before?.entitledDays.toString() ?? String(annualLeaveEntitlement(await this.baseDays(year), inScope.startDate ? ymdOf(inScope.startDate) : null, year));
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveBalance.upsert({
        where: { employeeId_year: { employeeId, year } },
        create: { employeeId, year, entitledDays: entitled, carriedOverDays: input.carriedOverDays ?? 0, adjustmentDays: input.adjustmentDays ?? 0, note: input.note, createdBy: actor.id, updatedBy: actor.id },
        update: { ...input, updatedBy: actor.id },
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'leave_balance', entityId: employeeId, before, after: row, meta }, tx);
      return row;
    });
  }
}
