import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  approvalDecisionSchema,
  listApprovalsQuerySchema,
  submitGeneralRequestSchema,
  upsertWorkflowSchema,
  type ApprovalDecisionInput,
  type ListApprovalsQuery,
  type SubmitGeneralRequestInput,
  type UpsertWorkflowInput,
} from '@bachmai/shared';
import { randomUUID } from 'node:crypto';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService } from './approvals.service';

@ApiTags('Quy trình duyệt')
@Controller()
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly prisma: PrismaService,
  ) {}

  // -------- Cấu hình --------

  @Get('approval-workflows')
  listWorkflows(@Query('targetType') targetType?: string) {
    return this.approvals.listWorkflows(targetType || undefined);
  }

  @Post('approval-workflows')
  @RequirePermissions('system.workflow.manage')
  createWorkflow(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(upsertWorkflowSchema)) body: UpsertWorkflowInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.createWorkflow(actor, body, meta);
  }

  @Patch('approval-workflows/:id')
  @RequirePermissions('system.workflow.manage')
  updateWorkflow(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(upsertWorkflowSchema)) body: UpsertWorkflowInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.updateWorkflow(actor, id, body, meta);
  }

  // -------- Phiếu --------

  @Get('approvals')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listApprovalsQuerySchema)) q: ListApprovalsQuery) {
    return this.approvals.list(actor, q);
  }

  @Get('approvals/count')
  count(@CurrentUser() actor: AuthUser) {
    return this.approvals.pendingCount(actor);
  }

  @Get('approvals/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.get(actor, id);
  }

  /** Tờ trình chung — các loại phiếu nghiệp vụ khác gửi qua module của chúng. */
  @Post('approvals')
  async submitGeneral(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(submitGeneralRequestSchema)) body: SubmitGeneralRequestInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const unit = body.unitId ? await this.prisma.unit.findUnique({ where: { id: body.unitId } }) : null;
    const req = await this.approvals.submit(
      actor,
      {
        workflowCode: body.workflowCode,
        targetType: 'GENERAL',
        targetId: randomUUID(),
        title: body.title,
        content: body.content,
        unitId: unit?.id ?? actor.unitId,
        campusId: unit?.campusId ?? actor.campusId,
        selectedApprovers: body.selectedApprovers,
      },
      meta,
    );
    return this.approvals.get(actor, req.id);
  }

  @Post('approvals/:id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approvalDecisionSchema)) body: ApprovalDecisionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.decide(actor, id, 'APPROVE', body.comment, meta);
  }

  @Post('approvals/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approvalDecisionSchema)) body: ApprovalDecisionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.decide(actor, id, 'REJECT', body.comment, meta);
  }

  @Post('approvals/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.approvals.cancel(actor, id, meta);
  }
}
