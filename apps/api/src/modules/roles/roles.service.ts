import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRoleInput, UpdateRoleInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { users: true, permissions: true } } },
    });
    return roles.map(({ _count, ...r }) => ({ ...r, userCount: _count.users, permissionCount: _count.permissions }));
  }

  async get(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw new NotFoundException('Không tìm thấy nhóm tài khoản');
    const { permissions, ...rest } = role;
    return { ...rest, permissionCodes: permissions.map((p) => p.permissionCode).sort() };
  }

  async create(actor: AuthUser, input: CreateRoleInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          dataScope: input.dataScope,
          createdBy: actor.id,
          updatedBy: actor.id,
          permissions: { create: input.permissionCodes.map((permissionCode) => ({ permissionCode })) },
        },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'role', entityId: role.id, after: input, meta }, tx);
      return role;
    });
  }

  async update(actor: AuthUser, id: string, input: UpdateRoleInput, meta: RequestMeta) {
    const before = await this.get(id);
    if (before.code === 'ADMIN' && (input.permissionCodes || input.dataScope)) {
      throw new BadRequestException('Nhóm Quản trị hệ thống luôn có toàn quyền, không thể thu hẹp');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.permissionCodes) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: input.permissionCodes.map((permissionCode) => ({ roleId: id, permissionCode })),
        });
      }
      const role = await tx.role.update({
        where: { id },
        data: { name: input.name, description: input.description, dataScope: input.dataScope, updatedBy: actor.id },
      });
      await this.audit.log(
        { actor, action: 'UPDATE', entity: 'role', entityId: id, before, after: { ...role, permissionCodes: input.permissionCodes ?? before.permissionCodes }, meta },
        tx,
      );
      return role;
    });
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const before = await this.get(id);
    if (before.isSystem) throw new BadRequestException('Không thể xóa nhóm tài khoản hệ thống');
    const users = await this.prisma.userRole.count({ where: { roleId: id } });
    if (users) throw new BadRequestException(`Nhóm đang có ${users} tài khoản, hãy chuyển tài khoản sang nhóm khác trước`);
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'role', entityId: id, before, meta }, tx);
    });
  }
}
