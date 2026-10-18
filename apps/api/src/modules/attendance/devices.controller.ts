import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createDeviceSchema,
  listPunchesQuerySchema,
  mapEmployeeNoSchema,
  updateDeviceSchema,
  type CreateDeviceInput,
  type ListPunchesQuery,
  type UpdateDeviceInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { ExcelService } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DevicesService } from './devices.service';
import { PunchesService } from './punches.service';

@ApiTags('Chấm công — Máy & dữ liệu quét')
@Controller('attendance')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly punches: PunchesService,
    private readonly excel: ExcelService,
  ) {}

  @Get('devices')
  @RequireAnyPermission('attendance.device.manage', 'attendance.report.read')
  list() {
    return this.devices.list();
  }

  @Post('devices')
  @RequirePermissions('attendance.device.manage')
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createDeviceSchema)) body: CreateDeviceInput, @ReqMeta() meta: RequestMeta) {
    return this.devices.create(actor, body, meta);
  }

  @Patch('devices/:id')
  @RequirePermissions('attendance.device.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDeviceSchema)) body: UpdateDeviceInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.devices.update(actor, id, body, meta);
  }

  @Delete('devices/:id')
  @RequirePermissions('attendance.device.manage')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.devices.remove(actor, id, meta);
    return { ok: true };
  }

  @Post('devices/:id/test')
  @HttpCode(200)
  @RequirePermissions('attendance.device.manage')
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.test(id);
  }

  @Post('devices/:id/sync')
  @HttpCode(200)
  @RequirePermissions('attendance.device.manage')
  sync(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.enqueueSync(id);
  }

  // -------- Dữ liệu quét --------

  @Get('punches')
  @RequirePermissions('attendance.punch.read')
  async listPunches(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(listPunchesQuerySchema)) q: ListPunchesQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.unmapped && !actor.permissions.has('attendance.device.manage')) q.unmapped = false;
    const data = await this.punches.list(actor, q, !!q.export);
    if (!q.export) return data;
    const buf = await this.excel.build([
      {
        name: 'Dữ liệu chấm công',
        rows: data.items,
        columns: [
          { header: 'Thời gian', width: 20, numFmt: 'dd/mm/yyyy hh:mm:ss', value: (p) => new Date(new Date(p.punchTime).getTime() + 7 * 3_600_000) },
          { header: 'Mã chấm công', value: (p) => p.employeeNo },
          { header: 'Mã NV', value: (p) => p.employee?.code },
          { header: 'Họ tên', width: 26, value: (p) => p.employee?.fullName ?? p.personName },
          { header: 'Đơn vị', width: 26, value: (p) => p.employee?.unit?.name },
          { header: 'Máy', width: 22, value: (p) => p.device.name },
          { header: 'Phương thức', value: (p) => p.verifyMode },
        ],
      },
    ]);
    this.excel.send(res, `du-lieu-cham-cong-${new Date().toISOString().slice(0, 10)}.xlsx`, buf);
  }

  @Get('punches/unmapped')
  @RequirePermissions('attendance.device.manage')
  unmapped() {
    return this.punches.unmappedSummary();
  }

  @Post('punches/map')
  @HttpCode(200)
  @RequirePermissions('attendance.device.manage', 'hr.employee.update')
  map(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(mapEmployeeNoSchema)) body: { employeeNo: string; employeeId: string }, @ReqMeta() meta: RequestMeta) {
    return this.punches.mapEmployeeNo(actor, body.employeeNo, body.employeeId, meta);
  }
}
