import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { scopeWhere } from '../../common/auth/data-scope';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  campusId: true,
  unitId: true,
  lockedUntil: true,
  lastLoginAt: true,
  mustChangePassword: true,
  totpEnabled: true,
  createdAt: true,
  updatedAt: true,
  campus: { select: { id: true, code: true, name: true } },
  unit: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
  managedUnits: { select: { unit: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toDto = (u: UserRow) => ({
  ...u,
  roles: u.roles.map((r) => r.role),
  managedUnits: u.managedUnits.map((m) => m.unit),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  private scope(actor: AuthUser): Prisma.UserWhereInput {
    return { deletedAt: null, ...scopeWhere(actor, { campus: 'campusId', unit: 'unitId', self: 'id' }) };
  }

  async list(actor: AuthUser, q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      AND: [
        this.scope(actor),
        {
          status: q.status,
          campusId: q.campusId,
          unitId: q.unitId,
          roles: q.roleId ? { some: { roleId: q.roleId } } : undefined,
        },
        q.search
          ? {
              OR: [
                { username: { contains: q.search, mode: 'insensitive' } },
                { fullName: { contains: q.search, mode: 'insensitive' } },
                { email: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toDto), total, q);
  }

  /** Toàn bộ kết quả lọc (tối đa 20.000 dòng) để xuất Excel. */
  async listAll(actor: AuthUser, q: ListUsersQuery) {
    const res = await this.list(actor, { ...q, page: 1, pageSize: 20_000 });
    return res.items;
  }

  /** Tra cứu nhanh tài khoản đang hoạt động (chọn người duyệt…) — chỉ trả thông tin cơ bản. */
  lookup(search?: string) {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(search
          ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { username: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      select: { id: true, username: true, fullName: true, unit: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
  }

  async reset2fa(actor: AuthUser, id: string, meta: RequestMeta) {
    await this.get(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, totpLastCounter: null, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'RESET_2FA', entity: 'user', entityId: id, meta }, tx);
    });
  }

  async get(actor: AuthUser, id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, ...this.scope(actor) }, select: USER_SELECT });
    if (!u) throw new NotFoundException('Không tìm thấy tài khoản');
    return toDto(u);
  }

  async create(actor: AuthUser, input: CreateUserInput, meta: RequestMeta) {
    await this.assertCanAssignRoles(actor, input.roleIds);
    const temporaryPassword = input.password ? undefined : this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(input.password ?? temporaryPassword!);

    const created = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          campusId: input.campusId ?? null,
          unitId: input.unitId ?? null,
          passwordHash,
          mustChangePassword: true,
          createdBy: actor.id,
          updatedBy: actor.id,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          managedUnits: { create: input.managedUnitIds.map((unitId) => ({ unitId })) },
        },
        select: USER_SELECT,
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'user', entityId: u.id, after: toDto(u), meta }, tx);
      return u;
    });
    return { user: toDto(created), temporaryPassword };
  }

  async update(actor: AuthUser, id: string, input: UpdateUserInput, meta: RequestMeta) {
    const before = await this.get(actor, id);
    if (input.roleIds) await this.assertCanAssignRoles(actor, input.roleIds);
    if (id === actor.id && input.status === 'DISABLED') {
      throw new BadRequestException('Không thể tự vô hiệu hóa tài khoản của mình');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (input.managedUnitIds) {
        await tx.userManagedUnit.deleteMany({ where: { userId: id } });
        await tx.userManagedUnit.createMany({ data: input.managedUnitIds.map((unitId) => ({ userId: id, unitId })) });
      }
      const u = await tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          campusId: input.campusId,
          unitId: input.unitId,
          status: input.status,
          updatedBy: actor.id,
        },
        select: USER_SELECT,
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'user', entityId: id, before, after: toDto(u), meta }, tx);
      return u;
    });
    if (input.status === 'DISABLED') await this.auth.revokeAllSessions(id);
    return toDto(updated);
  }

  async resetPassword(actor: AuthUser, id: string, meta: RequestMeta) {
    await this.get(actor, id);
    const temporaryPassword = this.passwords.generateTemporary();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash: await this.passwords.hash(temporaryPassword),
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedBy: actor.id,
        },
      });
      await this.audit.log({ actor, action: 'RESET_PASSWORD', entity: 'user', entityId: id, meta }, tx);
    });
    await this.auth.revokeAllSessions(id);
    return { temporaryPassword };
  }

  async setLocked(actor: AuthUser, id: string, locked: boolean, meta: RequestMeta) {
    if (id === actor.id) throw new BadRequestException('Không thể tự khóa tài khoản của mình');
    const before = await this.get(actor, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: locked
          ? { status: 'LOCKED', updatedBy: actor.id }
          : { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, updatedBy: actor.id },
        select: USER_SELECT,
      });
      await this.audit.log(
        { actor, action: locked ? 'LOCK' : 'UNLOCK', entity: 'user', entityId: id, before: { status: before.status }, after: { status: u.status }, meta },
        tx,
      );
      return u;
    });
    if (locked) await this.auth.revokeAllSessions(id);
    return toDto(updated);
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    if (id === actor.id) throw new BadRequestException('Không thể tự xóa tài khoản của mình');
    const before = await this.get(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED', updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'user', entityId: id, before, meta }, tx);
    });
    await this.auth.revokeAllSessions(id);
  }

  /**
   * Chống leo thang đặc quyền: người không có quyền quản lý nhóm chỉ được gán
   * những nhóm mà toàn bộ quyền của nhóm đó mình cũng đang có.
   */
  private async assertCanAssignRoles(actor: AuthUser, roleIds: string[]) {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      include: { permissions: true },
    });
    if (roles.length !== new Set(roleIds).size) throw new BadRequestException('Nhóm tài khoản không tồn tại');
    if (actor.permissions.has('system.role.manage')) return;
    const exceeding = roles.filter((r) => r.permissions.some((p) => !actor.permissions.has(p.permissionCode)));
    if (exceeding.length) {
      throw new ForbiddenException(`Bạn không được gán nhóm có quyền cao hơn mình: ${exceeding.map((r) => r.name).join(', ')}`);
    }
  }
}
