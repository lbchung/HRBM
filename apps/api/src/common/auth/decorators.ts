import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionCode } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Bỏ qua xác thực (đăng nhập, health check). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** Yêu cầu tài khoản có TẤT CẢ các quyền liệt kê. */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, codes);

export const ANY_PERMISSIONS_KEY = 'anyPermissions';
/** Yêu cầu tài khoản có ÍT NHẤT MỘT trong các quyền liệt kê. */
export const RequireAnyPermission = (...codes: PermissionCode[]) => SetMetadata(ANY_PERMISSIONS_KEY, codes);

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';
/** Cho phép gọi khi tài khoản chưa đổi mật khẩu lần đầu. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 500) };
});
