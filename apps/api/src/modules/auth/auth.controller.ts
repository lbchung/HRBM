import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  disable2faSchema,
  enable2faSchema,
  login2faSchema,
  loginSchema,
  type ChangePasswordInput,
  type Disable2faInput,
  type Login2faInput,
  type LoginInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { AllowPendingPassword, CurrentUser, Public, ReqMeta } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth.cookies';
import { AuthService } from './auth.service';

@ApiTags('Xác thực')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.login(body, meta);
    if (r.requires2fa) return { requires2fa: true, challenge: r.challenge };
    setAuthCookies(res, r.tokens, this.auth.cookieSecure);
    return { requires2fa: false, mustChangePassword: r.mustChangePassword };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/2fa')
  @HttpCode(200)
  async login2fa(
    @Body(new ZodValidationPipe(login2faSchema)) body: Login2faInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.loginWith2fa(body.challenge, body.code, meta);
    setAuthCookies(res, r.tokens, this.auth.cookieSecure);
    return { requires2fa: false, mustChangePassword: r.mustChangePassword };
  }

  @AllowPendingPassword()
  @Post('2fa/setup')
  @HttpCode(200)
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user);
  }

  @AllowPendingPassword()
  @Post('2fa/enable')
  @HttpCode(200)
  async enable2fa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(enable2faSchema)) body: { code: string },
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.enable2fa(user, body.code, meta);
    return { ok: true };
  }

  @Post('2fa/disable')
  @HttpCode(200)
  async disable2fa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(disable2faSchema)) body: Disable2faInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.disable2fa(user, body.password, body.code, meta);
    return { ok: true };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta);
      setAuthCookies(res, tokens, this.auth.cookieSecure);
      return { ok: true };
    } catch (e) {
      clearAuthCookies(res, this.auth.cookieSecure);
      throw e;
    }
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user, meta);
    clearAuthCookies(res, this.auth.cookieSecure);
    return { ok: true };
  }

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }

  @AllowPendingPassword()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.changePassword(user, body, meta);
    return { ok: true };
  }
}
