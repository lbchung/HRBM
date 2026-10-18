import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateCampusInput,
  CreateUnitInput,
  UpdateCampusInput,
  UpdateUnitInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Cơ sở ----------

  listCampuses() {
    return this.prisma.campus.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getCampus(id: string) {
    const c = await this.prisma.campus.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw new NotFoundException('Không tìm thấy cơ sở');
    return c;
  }

  createCampus(actor: AuthUser, input: CreateCampusInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.campus.create({ data: { ...input, createdBy: actor.id, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'campus', entityId: c.id, after: c, meta }, tx);
      return c;
    });
  }

  async updateCampus(actor: AuthUser, id: string, input: UpdateCampusInput, meta: RequestMeta) {
    const before = await this.getCampus(id);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.campus.update({ where: { id }, data: { ...input, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'campus', entityId: id, before, after: c, meta }, tx);
      return c;
    });
  }

  // ---------- Đơn vị ----------

  /** Danh sách phẳng; frontend dựng cây theo parentId. */
  listUnits() {
    return this.prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        campus: { select: { id: true, code: true, name: true } },
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
    });
  }

  async getUnit(id: string) {
    const u = await this.prisma.unit.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw new NotFoundException('Không tìm thấy đơn vị');
    return u;
  }

  async createUnit(actor: AuthUser, input: CreateUnitInput, meta: RequestMeta) {
    if (input.parentId) await this.getUnit(input.parentId);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({
        data: { ...input, parentId: input.parentId ?? null, campusId: input.campusId ?? null, createdBy: actor.id, updatedBy: actor.id },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'unit', entityId: u.id, after: u, meta }, tx);
      return u;
    });
  }

  async updateUnit(actor: AuthUser, id: string, input: UpdateUnitInput, meta: RequestMeta) {
    const before = await this.getUnit(id);
    if (input.parentId) await this.assertNoCycle(id, input.parentId);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.update({ where: { id }, data: { ...input, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'unit', entityId: id, before, after: u, meta }, tx);
      return u;
    });
  }

  async removeUnit(actor: AuthUser, id: string, meta: RequestMeta) {
    const before = await this.getUnit(id);
    const [children, users] = await Promise.all([
      this.prisma.unit.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.user.count({ where: { unitId: id, deletedAt: null } }),
    ]);
    if (children) throw new BadRequestException(`Đơn vị đang có ${children} đơn vị con`);
    if (users) throw new BadRequestException(`Đơn vị đang có ${users} tài khoản`);
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'unit', entityId: id, before, meta }, tx);
    });
  }

  async summary() {
    const [campuses, units, users, roles] = await this.prisma.$transaction([
      this.prisma.campus.count({ where: { deletedAt: null } }),
      this.prisma.unit.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.role.count(),
    ]);
    return { campuses, units, users, roles };
  }

  /** Không cho đặt đơn vị cha là chính nó hoặc một đơn vị con cháu của nó. */
  private async assertNoCycle(id: string, parentId: string) {
    const units = await this.prisma.unit.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(units.map((u) => [u.id, u.parentId]));
    if (!parentOf.has(parentId)) throw new BadRequestException('Đơn vị cha không tồn tại');
    for (let cur: string | null | undefined = parentId; cur; cur = parentOf.get(cur)) {
      if (cur === id) throw new BadRequestException('Đơn vị cha không hợp lệ (tạo vòng lặp)');
    }
  }
}
