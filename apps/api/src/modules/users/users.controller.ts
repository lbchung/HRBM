import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  USER_STATUS_LABELS,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
  type UserStatus,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ExcelService } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('Tài khoản')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly excel: ExcelService,
  ) {}

  @Get()
  @RequirePermissions('system.user.read')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listUsersQuerySchema)) q: ListUsersQuery) {
    return this.users.list(actor, q);
  }

  @Get('export')
  @RequirePermissions('system.user.read')
  async export(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) q: ListUsersQuery,
    @Res() res: Response,
  ) {
    const rows = await this.users.listAll(actor, q);
    const buf = await this.excel.build([
      {
        name: 'Tài khoản',
        rows,
        columns: [
          { header: 'Tên đăng nhập', value: (u) => u.username },
          { header: 'Họ tên', width: 28, value: (u) => u.fullName },
          { header: 'Email', width: 28, value: (u) => u.email },
          { header: 'Điện thoại', value: (u) => u.phone },
          { header: 'Nhóm tài khoản', width: 32, value: (u) => u.roles.map((r: { name: string }) => r.name).join(', ') },
          { header: 'Cơ sở', value: (u) => u.campus?.name },
          { header: 'Đơn vị', width: 30, value: (u) => u.unit?.name },
          { header: 'Trạng thái', value: (u) => USER_STATUS_LABELS[u.status as UserStatus] },
          { header: 'Xác thực 2 lớp', value: (u) => (u.totpEnabled ? 'Có' : '') },
          { header: 'Đăng nhập cuối', numFmt: 'dd/mm/yyyy hh:mm', value: (u) => u.lastLoginAt },
        ],
      },
    ]);
    this.excel.send(res, `tai-khoan-${new Date().toISOString().slice(0, 10)}.xlsx`, buf);
  }

  /** Tra cứu tài khoản để chọn người duyệt — mọi tài khoản đăng nhập đều dùng được. */
  @Get('lookup')
  lookup(@Query('search') search?: string) {
    return this.users.lookup(search?.trim() || undefined);
  }

  @Post(':id/reset-2fa')
  @HttpCode(200)
  @RequirePermissions('system.user.update')
  async reset2fa(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.users.reset2fa(actor, id, meta);
    return { ok: true };
  }

  @Get(':id')
  @RequirePermissions('system.user.read')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @RequirePermissions('system.user.create')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.create(actor, body, meta);
  }

  @Patch(':id')
  @RequirePermissions('system.user.update')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.update(actor, id, body, meta);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermissions('system.user.update')
  resetPassword(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.resetPassword(actor, id, meta);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @RequirePermissions('system.user.lock')
  lock(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.setLocked(actor, id, true, meta);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @RequirePermissions('system.user.lock')
  unlock(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.setLocked(actor, id, false, meta);
  }

  @Delete(':id')
  @RequirePermissions('system.user.delete')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.users.remove(actor, id, meta);
    return { ok: true };
  }
}
