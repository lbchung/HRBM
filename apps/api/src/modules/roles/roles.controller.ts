import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createRoleSchema,
  PERMISSION_MODULES,
  PERMISSIONS,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RolesService } from './roles.service';

@ApiTags('Nhóm tài khoản & phân quyền')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Danh sách nhóm — cần cho cả màn hình tài khoản (chọn nhóm) */
  @Get('roles')
  list() {
    return this.roles.list();
  }

  @Get('roles/:id')
  @RequirePermissions('system.role.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(id);
  }

  @Post('roles')
  @RequirePermissions('system.role.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.create(actor, body, meta);
  }

  @Patch('roles/:id')
  @RequirePermissions('system.role.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.update(actor, id, body, meta);
  }

  @Delete('roles/:id')
  @RequirePermissions('system.role.manage')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.roles.remove(actor, id, meta);
    return { ok: true };
  }

  @Get('permissions')
  @RequirePermissions('system.role.read')
  catalog() {
    return { modules: PERMISSION_MODULES, permissions: PERMISSIONS };
  }
}
