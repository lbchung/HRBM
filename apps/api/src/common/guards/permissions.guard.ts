import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth/auth-user';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../auth/decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const all = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    const any = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets);
    if (!all?.length && !any?.length) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    const okAll = !all?.length || (!!user && all.every((p) => user.permissions.has(p)));
    const okAny = !any?.length || (!!user && any.some((p) => user.permissions.has(p)));
    if (okAll && okAny) return true;
    throw new ForbiddenException('Bạn không có quyền thực hiện chức năng này');
  }
}
