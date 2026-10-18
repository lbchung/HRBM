import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCampusSchema,
  createUnitSchema,
  updateCampusSchema,
  updateUnitSchema,
  type CreateCampusInput,
  type CreateUnitInput,
  type UpdateCampusInput,
  type UpdateUnitInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgService } from './org.service';

/**
 * Danh mục tổ chức (cơ sở, đơn vị) là dữ liệu tra cứu dùng chung:
 * mọi tài khoản đã đăng nhập đều đọc được; thao tác ghi yêu cầu quyền quản lý.
 */
@ApiTags('Tổ chức')
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('summary')
  summary() {
    return this.org.summary();
  }

  @Get('campuses')
  listCampuses() {
    return this.org.listCampuses();
  }

  @Post('campuses')
  @RequirePermissions('org.campus.manage')
  createCampus(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createCampusSchema)) body: CreateCampusInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.org.createCampus(actor, body, meta);
  }

  @Patch('campuses/:id')
  @RequirePermissions('org.campus.manage')
  updateCampus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCampusSchema)) body: UpdateCampusInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.org.updateCampus(actor, id, body, meta);
  }

  @Get('units')
  listUnits() {
    return this.org.listUnits();
  }

  @Post('units')
  @RequirePermissions('org.unit.manage')
  createUnit(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUnitSchema)) body: CreateUnitInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.org.createUnit(actor, body, meta);
  }

  @Patch('units/:id')
  @RequirePermissions('org.unit.manage')
  updateUnit(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: UpdateUnitInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.org.updateUnit(actor, id, body, meta);
  }

  @Delete('units/:id')
  @RequirePermissions('org.unit.manage')
  async removeUnit(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.org.removeUnit(actor, id, meta);
    return { ok: true };
  }
}
