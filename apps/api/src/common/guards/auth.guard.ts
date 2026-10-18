import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from '../auth/decorators';
import { AuthService, type AccessTokenPayload } from '../../modules/auth/auth.service';
import { ACCESS_COOKIE } from '../../modules/auth/auth.cookies';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Chưa đăng nhập');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.auth.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    // Kiểm tra phiên còn hiệu lực + nạp quyền mới nhất (thu hồi quyền có hiệu lực ngay)
    const user = await this.auth.buildAuthUser(payload.sid, payload.sub);
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets)
    ) {
      throw new ForbiddenException({ message: 'Bạn cần đổi mật khẩu trước khi sử dụng', code: 'MUST_CHANGE_PASSWORD' });
    }

    req.user = user;
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const cookie = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (cookie) return cookie;
    const [type, value] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? value : undefined;
  }
}
