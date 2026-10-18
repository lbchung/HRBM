import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@bachmai/db';
import {
  nextApprovalState,
  type ApprovalDecision,
  type ApprovalStepSnapshot,
  type ListApprovalsQuery,
  type UpsertWorkflowInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export const APPROVAL_COMPLETED_EVENT = 'approval.completed';

/** Sự kiện phát ra khi phiếu kết thúc — module nghiệp vụ lắng nghe theo targetType. */
export interface ApprovalCompletedEvent {
  requestId: string;
  targetType: string;
  targetId: string;
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  actorId: string;
}

export interface SubmitApprovalInput {
  workflowCode: string;
  targetType: string;
  targetId: string;
  title: string;
  content?: string | null;
  unitId?: string | null;
  campusId?: string | null;
  /** Người duyệt do người gửi chọn cho các bước SELECTED: { "1": [userId] } */
  selectedApprovers?: Record<string, string[]>;
}

const ACTIVE_USER = { status: 'ACTIVE', deletedAt: null } satisfies Prisma.UserWhereInput;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  // ================= CẤU HÌNH QUY TRÌNH =================

  listWorkflows(targetType?: string) {
    return this.prisma.approvalWorkflow.findMany({
      where: { targetType },
      orderBy: { createdAt: 'asc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, _count: { select: { requests: true } } },
    });
  }

  async createWorkflow(actor: AuthUser, input: UpsertWorkflowInput, meta: RequestMeta) {
    await this.assertRoles(input);
    return this.prisma.$transaction(async (tx) => {
      const wf = await tx.approvalWorkflow.create({
        data: {
          code: input.code,
          name: input.name,
          targetType: input.targetType,
          description: input.description,
          isActive: input.isActive,
          createdBy: actor.id,
          updatedBy: actor.id,
          steps: { create: this.toSteps(input) },
        },
        include: { steps: true },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'approval_workflow', entityId: wf.id, after: wf, meta }, tx);
      return wf;
    });
  }

  /** Sửa quy trình không ảnh hưởng phiếu đang chạy (phiếu giữ ảnh chụp các bước lúc gửi). */
  async updateWorkflow(actor: AuthUser, id: string, input: UpsertWorkflowInput, meta: RequestMeta) {
    const before = await this.prisma.approvalWorkflow.findUnique({ where: { id }, include: { steps: true } });
    if (!before) throw new NotFoundException('Không tìm thấy quy trình');
    await this.assertRoles(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.deleteMany({ where: { workflowId: id } });
      const wf = await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name: input.name,
          targetType: input.targetType,
          description: input.description ?? null,
          isActive: input.isActive,
          updatedBy: actor.id,
          steps: { create: this.toSteps(input) },
        },
        include: { steps: true },
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'approval_workflow', entityId: id, before, after: wf, meta }, tx);
      return wf;
    });
  }

  private toSteps(input: UpsertWorkflowInput) {
    return input.steps.map((s, i) => ({
      stepOrder: i + 1,
      name: s.name,
      approverType: s.approverType as ApprovalStepSnapshot['approverType'],
      roleId: s.approverType === 'ROLE' ? (s.roleId ?? null) : null,
    }));
  }

  private async assertRoles(input: UpsertWorkflowInput) {
    const roleIds = input.steps.map((s) => s.roleId).filter((x): x is string => !!x);
    if (!roleIds.length) return;
    const n = await this.prisma.role.count({ where: { id: { in: roleIds } } });
    if (n !== new Set(roleIds).size) throw new BadRequestException('Nhóm tài khoản duyệt không tồn tại');
  }

  // ================= GỬI / DUYỆT =================

  /** Gửi phiếu vào quy trình. Gọi trong transaction của module nghiệp vụ bằng tham số `tx`. */
  async submit(actor: AuthUser, input: SubmitApprovalInput, meta: RequestMeta, tx?: Prisma.TransactionClient) {
    const run = async (t: Prisma.TransactionClient) => {
      const wf = await t.approvalWorkflow.findUnique({
        where: { code: input.workflowCode },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
      if (!wf || !wf.isActive) throw new BadRequestException('Quy trình duyệt không tồn tại hoặc đã ngừng sử dụng');
      if (wf.targetType !== input.targetType) throw new BadRequestException('Quy trình không áp dụng cho loại phiếu này');
      if (!wf.steps.length) throw new BadRequestException('Quy trình chưa có bước duyệt');

      const steps: ApprovalStepSnapshot[] = wf.steps.map((s) => ({
        stepOrder: s.stepOrder,
        name: s.name,
        approverType: s.approverType,
        roleId: s.roleId,
      }));
      const selected = input.selectedApprovers ?? {};
      // Kiểm tra trước mọi bước SELECTED để báo lỗi ngay khi gửi
      for (const s of steps.filter((x) => x.approverType === 'SELECTED')) {
        await this.resolveAssignees(t, s, input, selected);
      }

      const first = steps[0];
      const request = await t.approvalRequest.create({
        data: {
          workflowId: wf.id,
          targetType: input.targetType,
          targetId: input.targetId,
          title: input.title,
          content: input.content,
          status: 'PENDING',
          currentStep: first.stepOrder,
          stepsSnapshot: { steps, selected } as unknown as Prisma.InputJsonValue,
          unitId: input.unitId ?? null,
          campusId: input.campusId ?? null,
          requestedBy: actor.id,
        },
      });
      await this.activateStep(t, request.id, first, input, selected);
      await t.approvalAction.create({
        data: { requestId: request.id, stepOrder: 0, actorId: actor.id, actorName: actor.fullName, action: 'SUBMIT' },
      });
      await this.audit.log({ actor, action: 'SUBMIT', entity: 'approval', entityId: request.id, after: { title: input.title, workflow: wf.code }, meta }, t);
      return request;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async decide(actor: AuthUser, id: string, decision: ApprovalDecision, comment: string | undefined, meta: RequestMeta) {
    const result = await this.prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.findUnique({ where: { id }, include: { assignees: true } });
      if (!req) throw new NotFoundException('Không tìm thấy phiếu');
      if (req.status !== 'PENDING') throw new BadRequestException('Phiếu đã được xử lý');
      const isAssignee = req.assignees.some((a) => a.stepOrder === req.currentStep && a.userId === actor.id);
      if (!isAssignee) throw new ForbiddenException('Bạn không phải người duyệt ở bước hiện tại');
      if (decision === 'REJECT' && !comment) {
        throw new BadRequestException({ message: 'Nhập lý do từ chối', errors: { comment: ['Nhập lý do từ chối'] } });
      }

      const { steps, selected } = req.stepsSnapshot as unknown as { steps: ApprovalStepSnapshot[]; selected: Record<string, string[]> };
      const next = nextApprovalState(steps, req.currentStep, decision);

      // Chống xử lý trùng khi hai người duyệt cùng lúc: chỉ cập nhật nếu trạng thái chưa đổi
      const updated = await tx.approvalRequest.updateMany({
        where: { id, status: 'PENDING', currentStep: req.currentStep },
        data: {
          status: next.status,
          currentStep: next.currentStep,
          completedAt: next.status === 'PENDING' ? null : new Date(),
        },
      });
      if (updated.count === 0) throw new BadRequestException('Phiếu vừa được người khác xử lý, vui lòng tải lại');

      await tx.approvalAction.create({
        data: { requestId: id, stepOrder: req.currentStep, actorId: actor.id, actorName: actor.fullName, action: decision, comment },
      });
      if (next.status === 'PENDING') {
        const step = steps.find((s) => s.stepOrder === next.currentStep)!;
        await this.activateStep(tx, id, step, req, selected);
      }
      await this.audit.log({ actor, action: decision, entity: 'approval', entityId: id, after: { step: req.currentStep, status: next.status, comment }, meta }, tx);
      if (next.status !== 'PENDING') {
        await this.notifications.notify(
          [req.requestedBy],
          {
            title: `${next.status === 'APPROVED' ? 'Đã duyệt' : 'Bị từ chối'}: ${req.title}`,
            body: comment ? `${actor.fullName}: ${comment}` : actor.fullName,
            link: `/approvals?open=${id}`,
          },
          tx,
        );
      }
      return { req, status: next.status };
    });

    if (result.status !== 'PENDING') {
      this.emitCompleted(result.req.id, result.req.targetType, result.req.targetId, result.status, actor.id);
    }
    return this.get(actor, id);
  }

  async cancel(actor: AuthUser, id: string, meta: RequestMeta) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Không tìm thấy phiếu');
    if (req.requestedBy !== actor.id) throw new ForbiddenException('Chỉ người gửi được hủy phiếu');
    if (req.status !== 'PENDING') throw new BadRequestException('Chỉ hủy được phiếu đang chờ duyệt');
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
      await tx.approvalAction.create({
        data: { requestId: id, stepOrder: req.currentStep, actorId: actor.id, actorName: actor.fullName, action: 'CANCEL' },
      });
      await this.audit.log({ actor, action: 'CANCEL', entity: 'approval', entityId: id, meta }, tx);
    });
    this.emitCompleted(id, req.targetType, req.targetId, 'CANCELLED', actor.id);
    return this.get(actor, id);
  }

  // ================= TRA CỨU =================

  async list(actor: AuthUser, q: ListApprovalsQuery) {
    const status = q.status as Prisma.ApprovalRequestWhereInput['status'];
    const where: Prisma.ApprovalRequestWhereInput =
      q.box === 'sent'
        ? { requestedBy: actor.id, status }
        : q.box === 'processed'
          ? { actions: { some: { actorId: actor.id, action: { in: ['APPROVE', 'REJECT'] } } }, status }
          : { status: 'PENDING', assignees: { some: { userId: actor.id } } };

    // Hộp "chờ tôi duyệt": chỉ phiếu mà tôi là người duyệt của BƯỚC HIỆN TẠI
    const rows = await this.prisma.approvalRequest.findMany({
      where: { ...where, ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}) },
      include: { assignees: { select: { stepOrder: true, userId: true } }, workflow: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      ...(q.box === 'inbox' ? {} : toSkipTake(q)),
    });
    const filtered = q.box === 'inbox' ? rows.filter((r) => r.assignees.some((a) => a.stepOrder === r.currentStep && a.userId === actor.id)) : rows;
    const total = q.box === 'inbox' ? filtered.length : await this.prisma.approvalRequest.count({ where });
    const page = q.box === 'inbox' ? filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize) : filtered;

    const requesterIds = [...new Set(page.map((r) => r.requestedBy))];
    const requesters = await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, fullName: true } });
    const nameOf = new Map(requesters.map((u) => [u.id, u.fullName]));
    return paginated(
      page.map(({ assignees: _a, stepsSnapshot, ...r }) => ({
        ...r,
        requesterName: nameOf.get(r.requestedBy) ?? '',
        currentStepName: (stepsSnapshot as unknown as { steps: ApprovalStepSnapshot[] }).steps.find((s) => s.stepOrder === r.currentStep)?.name,
      })),
      total,
      q,
    );
  }

  async pendingCount(actor: AuthUser) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { status: 'PENDING', assignees: { some: { userId: actor.id } } },
      select: { currentStep: true, assignees: { where: { userId: actor.id }, select: { stepOrder: true } } },
    });
    return { pending: rows.filter((r) => r.assignees.some((a) => a.stepOrder === r.currentStep)).length };
  }

  async get(actor: AuthUser, id: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        workflow: { select: { code: true, name: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, username: true } } } },
        actions: { orderBy: { id: 'asc' } },
      },
    });
    if (!req) throw new NotFoundException('Không tìm thấy phiếu');
    const involved =
      req.requestedBy === actor.id ||
      req.assignees.some((a) => a.userId === actor.id) ||
      actor.permissions.has('system.workflow.manage');
    if (!involved) throw new ForbiddenException('Bạn không có quyền xem phiếu này');

    const { steps } = req.stepsSnapshot as unknown as { steps: ApprovalStepSnapshot[] };
    const requester = await this.prisma.user.findUnique({ where: { id: req.requestedBy }, select: { fullName: true } });
    return {
      id: req.id,
      title: req.title,
      content: req.content,
      status: req.status,
      targetType: req.targetType,
      targetId: req.targetId,
      currentStep: req.currentStep,
      workflow: req.workflow,
      requestedBy: req.requestedBy,
      requesterName: requester?.fullName ?? '',
      createdAt: req.createdAt,
      completedAt: req.completedAt,
      canDecide: req.status === 'PENDING' && req.assignees.some((a) => a.stepOrder === req.currentStep && a.userId === actor.id),
      canCancel: req.status === 'PENDING' && req.requestedBy === actor.id,
      steps: steps.map((s) => ({
        ...s,
        assignees: req.assignees.filter((a) => a.stepOrder === s.stepOrder).map((a) => a.user),
      })),
      actions: req.actions.map((a) => ({ ...a, id: a.id.toString() })),
    };
  }

  // ================= NỘI BỘ =================

  private async activateStep(
    tx: Prisma.TransactionClient,
    requestId: string,
    step: ApprovalStepSnapshot,
    ctx: { unitId?: string | null; campusId?: string | null; title: string },
    selected: Record<string, string[]>,
  ) {
    const userIds = await this.resolveAssignees(tx, step, ctx, selected);
    await tx.approvalAssignee.createMany({
      data: userIds.map((userId) => ({ requestId, stepOrder: step.stepOrder, userId })),
      skipDuplicates: true,
    });
    await this.notifications.notify(
      userIds,
      { title: `Phiếu cần duyệt: ${ctx.title}`, body: `Bước: ${step.name}`, link: `/approvals?open=${requestId}` },
      tx,
    );
  }

  /** Xác định người duyệt của một bước. Không tìm được ai → lỗi (phiếu không được "treo"). */
  private async resolveAssignees(
    tx: Prisma.TransactionClient,
    step: ApprovalStepSnapshot,
    ctx: { unitId?: string | null; campusId?: string | null },
    selected: Record<string, string[]>,
  ): Promise<string[]> {
    let users: { id: string }[] = [];
    if (step.approverType === 'SELECTED') {
      const ids = [...new Set(selected[String(step.stepOrder)] ?? [])];
      if (!ids.length) {
        throw new BadRequestException({
          message: `Chọn người duyệt cho bước "${step.name}"`,
          errors: { [`selectedApprovers.${step.stepOrder}`]: ['Chọn người duyệt'] },
        });
      }
      users = await tx.user.findMany({ where: { id: { in: ids }, ...ACTIVE_USER }, select: { id: true } });
      if (users.length !== ids.length) throw new BadRequestException(`Người duyệt bước "${step.name}" không hợp lệ hoặc đã bị khóa`);
    } else if (step.approverType === 'UNIT_MANAGER') {
      if (!ctx.unitId) throw new BadRequestException(`Bước "${step.name}" cần phiếu có đơn vị`);
      users = await tx.user.findMany({ where: { ...ACTIVE_USER, managedUnits: { some: { unitId: ctx.unitId } } }, select: { id: true } });
    } else if (step.approverType === 'ROLE' && step.roleId) {
      const role = await tx.role.findUnique({ where: { id: step.roleId } });
      if (!role) throw new BadRequestException(`Nhóm duyệt của bước "${step.name}" không còn tồn tại`);
      const scope: Prisma.UserWhereInput =
        role.dataScope === 'CAMPUS' && ctx.campusId
          ? { campusId: ctx.campusId }
          : (role.dataScope === 'UNIT' || role.dataScope === 'SELF') && ctx.unitId
            ? { OR: [{ unitId: ctx.unitId }, { managedUnits: { some: { unitId: ctx.unitId } } }] }
            : {};
      users = await tx.user.findMany({ where: { ...ACTIVE_USER, roles: { some: { roleId: role.id } }, ...scope }, select: { id: true } });
    }
    if (!users.length) throw new BadRequestException(`Không tìm thấy người duyệt cho bước "${step.name}"`);
    return users.map((u) => u.id);
  }

  private emitCompleted(requestId: string, targetType: string, targetId: string, status: ApprovalCompletedEvent['status'], actorId: string) {
    const event: ApprovalCompletedEvent = { requestId, targetType, targetId, status, actorId };
    this.events.emit(APPROVAL_COMPLETED_EVENT, event);
  }
}
