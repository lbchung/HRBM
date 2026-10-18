import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createDutyRateSchema,
  createShiftSchema,
  holidaySchema,
  nullableUuid,
  updateShiftSchema,
  ymdOf,
  type CreateDutyRateInput,
  type CreateShiftInput,
  type HolidayInput,
  type UpdateShiftInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftsService } from './shifts.service';
import { TimesheetService } from './timesheet.service';

@ApiTags('Chấm công — Ca, ngày lễ, tiền trực')
@Controller('attendance')
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly timesheet: TimesheetService,
    private readonly prisma: PrismaService,
  ) {}

  /** Danh mục ca — dữ liệu tra cứu, mọi tài khoản đọc được */
  @Get('shifts')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.shifts.list(includeInactive === 'true');
  }

  @Post('shifts')
  @RequirePermissions('attendance.shift.manage')
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createShiftSchema)) body: CreateShiftInput, @ReqMeta() meta: RequestMeta) {
    return this.shifts.create(actor, body, meta);
  }

  @Patch('shifts/:id')
  @RequirePermissions('attendance.shift.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateShiftSchema)) body: UpdateShiftInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shifts.update(actor, id, body, meta);
  }

  @Get('duty-rates')
  @RequireAnyPermission('attendance.shift.manage', 'duty.pay.read', 'payroll.config.manage')
  dutyRates() {
    return this.shifts.dutyRates();
  }

  @Post('shifts/:id/duty-rates')
  @RequireAnyPermission('attendance.shift.manage', 'payroll.config.manage')
  addDutyRate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createDutyRateSchema)) body: CreateDutyRateInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.shifts.addDutyRate(actor, id, body, meta);
  }

  @Delete('duty-rates/:id')
  @RequireAnyPermission('attendance.shift.manage', 'payroll.config.manage')
  async removeDutyRate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.shifts.removeDutyRate(actor, id, meta);
    return { ok: true };
  }

  @Get('holidays')
  holidays(@Query('year') year?: string) {
    return this.shifts.holidays(year ? Number(year) : undefined);
  }

  @Post('holidays')
  @RequirePermissions('attendance.shift.manage')
  async addHoliday(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(holidaySchema)) body: HolidayInput, @ReqMeta() meta: RequestMeta) {
    const h = await this.shifts.addHoliday(actor, body, meta);
    await this.recomputeDay(ymdOf(h.date));
    return h;
  }

  @Delete('holidays/:id')
  @RequirePermissions('attendance.shift.manage')
  async removeHoliday(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    const h = await this.shifts.removeHoliday(actor, id, meta);
    await this.recomputeDay(ymdOf(h.date));
    return { ok: true };
  }

  @Put('units/:id/default-shift')
  @RequirePermissions('attendance.schedule.manage')
  async setDefault(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ shiftId: nullableUuid }))) body: { shiftId?: string | null },
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.timesheet.assertUnitInScope(actor, id);
    return this.shifts.setUnitDefault(actor, id, body.shiftId ?? null, meta);
  }

  /** Thêm/xóa ngày lễ → tính lại công ngày đó cho những người có lịch hoặc dòng công */
  private async recomputeDay(date: string) {
    const d = new Date(`${date}T00:00:00Z`);
    const [s, r] = await Promise.all([
      this.prisma.schedule.findMany({ where: { date: d }, select: { employeeId: true }, distinct: ['employeeId'] }),
      this.prisma.dailyTimesheet.findMany({ where: { date: d }, select: { employeeId: true }, distinct: ['employeeId'] }),
    ]);
    const ids = [...new Set([...s, ...r].map((x) => x.employeeId))];
    await this.timesheet.enqueueRecompute(ids.map((employeeId) => ({ employeeId, from: date, to: date })));
  }
}
