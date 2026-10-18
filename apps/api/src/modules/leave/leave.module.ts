import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  dateOnlySchema,
  leaveBalanceQuerySchema,
  listLeaveRequestsQuerySchema,
  optionalText,
  updateLeaveBalanceSchema,
  updateLeaveTypeSchema,
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
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrModule } from '../hr/hr.module';
import { LeaveService } from './leave.service';

const previewSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  startSession: z.enum(['AM', 'PM']).default('AM'),
  endSession: z.enum(['AM', 'PM']).default('PM'),
});

@ApiTags('Nghỉ - Công tác')
@Controller('leave')
class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  types(@Query('includeInactive') includeInactive?: string) {
    return this.leave.types(includeInactive === 'true');
  }

  @Post('types')
  @RequirePermissions('leave.type.manage')
  createType(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createLeaveTypeSchema)) body: CreateLeaveTypeInput, @ReqMeta() meta: RequestMeta) {
    return this.leave.createType(actor, body, meta);
  }

  @Patch('types/:id')
  @RequirePermissions('leave.type.manage')
  updateType(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeaveTypeSchema)) body: UpdateLeaveTypeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.leave.updateType(actor, id, body, meta);
  }

  @Get('days')
  days(@Query(new ZodValidationPipe(previewSchema)) q: { from: Date; to: Date; startSession: HalfDay; endSession: HalfDay }) {
    return this.leave.previewDays(ymdOf(q.from), ymdOf(q.to), q.startSession, q.endSession);
  }

  @Get('requests')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listLeaveRequestsQuerySchema)) q: ListLeaveRequestsQuery) {
    return this.leave.list(actor, q);
  }

  @Get('requests/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.get(actor, id);
  }

  @Post('requests')
  @RequireAnyPermission('leave.request.create', 'self.leave.create')
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createLeaveRequestSchema)) body: CreateLeaveRequestInput, @ReqMeta() meta: RequestMeta) {
    return this.leave.create(actor, body, meta);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ reason: optionalText(500) }))) body: { reason?: string },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.leave.cancel(actor, id, body.reason, meta);
  }

  @Get('balances')
  @RequireAnyPermission('leave.type.manage', 'leave.request.approve', 'leave.request.create')
  balances(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(leaveBalanceQuerySchema)) q: LeaveBalanceQuery) {
    return this.leave.balances(actor, q);
  }

  @Get('balances/me')
  myBalance(@CurrentUser() actor: AuthUser, @Query('year', ParseIntPipe) year: number) {
    return this.leave.myBalance(actor, year);
  }

  @Post('balances/init')
  @HttpCode(200)
  @RequirePermissions('leave.type.manage')
  init(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(z.object({ year: z.coerce.number().int().min(2000).max(2100) }))) body: { year: number }, @ReqMeta() meta: RequestMeta) {
    return this.leave.initBalances(actor, body.year, meta);
  }

  @Patch('balances/:employeeId/:year')
  @RequirePermissions('leave.type.manage')
  updateBalance(
    @CurrentUser() actor: AuthUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body(new ZodValidationPipe(updateLeaveBalanceSchema)) body: UpdateLeaveBalanceInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.leave.updateBalance(actor, employeeId, year, body, meta);
  }
}

@Module({
  imports: [HrModule, AttendanceModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
