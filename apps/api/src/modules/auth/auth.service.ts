import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import QRCode from 'qrcode';
import { widestScope, type ChangePasswordInput, type LoginInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { IssuedTokens } from './auth.cookies';
import { PasswordService } from './password.service';
import { generateTotpSecret, totpUri, verifyTotp } from './totp';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  username: string;
}

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  readonly accessSecret: string;
  readonly cookieSecure: boolean;
  private readonly accessTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly idleMs: number;
  private readonly maxFailed: number;
  private readonly lockMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    if (this.accessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET phải dài tối thiểu 32 ký tự');
    this.cookieSecure = config.get('COOKIE_SECURE') === 'true';
    this.accessTtlMs = Number(config.get('JWT_ACCESS_TTL_MINUTES', 15)) * 60_000;
    this.sessionTtlMs = Number(config.get('SESSION_TTL_HOURS', 12)) * 3_600_000;
    this.idleMs = Number(config.get('SESSION_IDLE_MINUTES', 60)) * 60_000;
    this.maxFailed = Number(config.get('LOGIN_MAX_FAILED', 5));
    this.lockMs = Number(config.get('LOGIN_LOCK_MINUTES', 15)) * 60_000;
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const username = input.username.toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { username, deletedAt: null } });

    const passwordOk = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    const now = new Date();

    if (!user) {
      await this.audit.log({ username, action: 'LOGIN_FAILED', entity: 'auth', meta });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      const until = user.lockedUntil.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
      throw new ForbiddenException(`Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau ${until}`);
    }

    if (!passwordOk) await this.registerFailure(user, meta, INVALID_CREDENTIALS);

    // Chỉ tiết lộ trạng thái tài khoản khi đã nhập đúng mật khẩu
    if (user.status === 'DISABLED') {
      throw new ForbiddenException('Tài khoản đã bị vô hiệu hóa');
    }
    if (user.status === 'LOCKED') {
      throw new ForbiddenException('Tài khoản đã bị khóa, vui lòng liên hệ quản trị hệ thống');
    }

    // Đã bật 2FA → chưa tạo phiên, trả về mã thử thách 5 phút để nhập mã OTP
    if (user.totpEnabled && user.totpSecret) {
      const challenge = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa' },
        { secret: this.accessSecret, expiresIn: 300 },
      );
      return { requires2fa: true as const, challenge };
    }
    return this.completeLogin(user, meta);
  }

  /** Bước 2 khi bật xác thực 2 lớp. Nhập sai mã OTP cũng tính vào số lần đăng nhập sai. */
  async loginWith2fa(challenge: string, code: string, meta: RequestMeta) {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(challenge, { secret: this.accessSecret });
      if (payload.purpose !== '2fa') throw new Error();
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Phiên xác thực đã hết hạn, vui lòng đăng nhập lại');
    }
    const user = await this.prisma.user.findFirst({ where: { id: sub, deletedAt: null, status: 'ACTIVE' } });
    if (!user?.totpEnabled || !user.totpSecret) throw new UnauthorizedException('Phiên xác thực không hợp lệ');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException('Tài khoản đang tạm khóa');

    const counter = verifyTotp(this.encryption.decrypt(user.totpSecret)!, code, user.totpLastCounter);
    if (counter === null) await this.registerFailure(user, meta, 'Mã xác thực không đúng');
    await this.prisma.user.update({ where: { id: user.id }, data: { totpLastCounter: counter } });
    return this.completeLogin(user, meta);
  }

  // ---------- Xác thực 2 lớp ----------

  /** Bắt đầu bật 2FA: sinh secret mới (chưa kích hoạt) và mã QR để quét bằng ứng dụng Authenticator. */
  async setup2fa(user: AuthUser) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (record.totpEnabled) throw new BadRequestException('Xác thực 2 lớp đang được bật');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: this.encryption.encrypt(secret), totpLastCounter: null } });
    const uri = totpUri(secret, user.username);
    return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
  }

  async enable2fa(user: AuthUser, code: string, meta: RequestMeta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (record.totpEnabled) throw new BadRequestException('Xác thực 2 lớp đang được bật');
    if (!record.totpSecret) throw new BadRequestException('Hãy tạo mã QR trước');
    const counter = verifyTotp(this.encryption.decrypt(record.totpSecret)!, code, null);
    if (counter === null) throw new BadRequestException({ message: 'Mã xác thực không đúng', errors: { code: ['Mã xác thực không đúng'] } });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpLastCounter: counter } });
      await this.audit.log({ actor: user, action: 'ENABLE_2FA', entity: 'auth', entityId: user.id, meta }, tx);
    });
  }

  async disable2fa(user: AuthUser, password: string, code: string, meta: RequestMeta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.totpEnabled || !record.totpSecret) throw new BadRequestException('Xác thực 2 lớp chưa được bật');
    if (!(await this.passwords.verify(record.passwordHash, password))) {
      throw new BadRequestException({ message: 'Mật khẩu không đúng', errors: { password: ['Mật khẩu không đúng'] } });
    }
    if (verifyTotp(this.encryption.decrypt(record.totpSecret)!, code, record.totpLastCounter) === null) {
      throw new BadRequestException({ message: 'Mã xác thực không đúng', errors: { code: ['Mã xác thực không đúng'] } });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, totpLastCounter: null } });
      await this.audit.log({ actor: user, action: 'DISABLE_2FA', entity: 'auth', entityId: user.id, meta }, tx);
    });
  }

  private async registerFailure(user: { id: string; username: string; failedLoginCount: number }, meta: RequestMeta, message: string): Promise<never> {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= this.maxFailed;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + this.lockMs) : null,
      },
    });
    await this.audit.log({ actor: user, action: lock ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', entity: 'auth', entityId: user.id, meta });
    throw new UnauthorizedException(
      lock
        ? `Đăng nhập sai ${this.maxFailed} lần, tài khoản tạm khóa ${this.lockMs / 60_000} phút`
        : `${message} (còn ${this.maxFailed - failed} lần thử)`,
    );
  }

  private async completeLogin(user: { id: string; username: string; mustChangePassword: boolean }, meta: RequestMeta) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tokens = await this.createSession(user.id, user.username, meta);
    await this.audit.log({ actor: user, action: 'LOGIN', entity: 'auth', entityId: user.id, meta });
    return { requires2fa: false as const, tokens, mustChangePassword: user.mustChangePassword };
  }

  async refresh(refreshToken: string | undefined, meta: RequestMeta): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < now ||
      session.lastUsedAt.getTime() + this.idleMs < now ||
      session.user.deletedAt ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }

    // Xoay vòng refresh token: token cũ mất hiệu lực ngay
    const newRefresh = randomBytes(48).toString('base64url');
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(newRefresh), lastUsedAt: new Date(now), ip: meta.ip },
    });
    return {
      accessToken: await this.signAccess(session.userId, session.user.username, session.id),
      refreshToken: newRefresh,
      accessMaxAgeMs: this.accessTtlMs,
      sessionMaxAgeMs: session.expiresAt.getTime() - now,
    };
  }

  async logout(user: AuthUser, meta: RequestMeta) {
    await this.prisma.session.updateMany({
      where: { id: user.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ actor: user, action: 'LOGOUT', entity: 'auth', entityId: user.id, meta });
  }

  async changePassword(user: AuthUser, input: ChangePasswordInput, meta: RequestMeta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, input.currentPassword))) {
      throw new BadRequestException({
        message: 'Mật khẩu hiện tại không đúng',
        errors: { currentPassword: ['Mật khẩu hiện tại không đúng'] },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await this.passwords.hash(input.newPassword),
          passwordChangedAt: new Date(),
          mustChangePassword: false,
        },
      });
      // Đăng xuất các phiên khác
      await tx.session.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ actor: user, action: 'CHANGE_PASSWORD', entity: 'auth', entityId: user.id, meta }, tx);
    });
  }

  /** Nạp ngữ cảnh người dùng từ phiên. Trả null nếu phiên/tài khoản không còn hợp lệ. */
  async buildAuthUser(sessionId: string, userId: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            roles: { include: { role: { include: { permissions: true } } } },
            permissions: true,
            managedUnits: true,
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      return null;
    }
    const u = session.user;
    if (u.deletedAt || u.status !== 'ACTIVE') return null;

    const permissions = new Set<string>(u.permissions.map((p) => p.permissionCode));
    for (const ur of u.roles) for (const rp of ur.role.permissions) permissions.add(rp.permissionCode);

    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      sessionId,
      campusId: u.campusId,
      unitId: u.unitId,
      managedUnitIds: u.managedUnits.map((m) => m.unitId),
      roles: u.roles.map((r) => r.role.code),
      permissions,
      dataScope: widestScope(u.roles.map((r) => r.role.dataScope)),
      mustChangePassword: u.mustChangePassword,
    };
  }

  async profile(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        lastLoginAt: true,
        mustChangePassword: true,
        totpEnabled: true,
        campus: { select: { id: true, code: true, name: true } },
        unit: { select: { id: true, code: true, name: true } },
        roles: { select: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
    return {
      ...u,
      roles: u.roles.map((r) => r.role),
      permissions: [...user.permissions].sort(),
      dataScope: user.dataScope,
    };
  }

  /** Thu hồi mọi phiên của tài khoản (khi khóa, đặt lại mật khẩu, xóa). */
  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(userId: string, username: string, meta: RequestMeta): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken: await this.signAccess(userId, username, session.id),
      refreshToken,
      accessMaxAgeMs: this.accessTtlMs,
      sessionMaxAgeMs: this.sessionTtlMs,
    };
  }

  private signAccess(userId: string, username: string, sessionId: string) {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId, username };
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: Math.floor(this.accessTtlMs / 1000),
    });
  }
}
