import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import { CATALOG_TYPES, type CatalogType, type CreateCatalogItemInput, type UpdateCatalogItemInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async types() {
    const counts = await this.prisma.catalogItem.groupBy({ by: ['type'], _count: { _all: true } });
    const countOf = new Map(counts.map((c) => [c.type, c._count._all]));
    return Object.entries(CATALOG_TYPES).map(([code, def]) => ({ code, ...def, count: countOf.get(code) ?? 0 }));
  }

  list(type?: string, includeInactive = false) {
    return this.prisma.catalogItem.findMany({
      where: { type, isActive: includeInactive ? undefined : true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, type: true, code: true, name: true, description: true, meta: true, sortOrder: true, isActive: true },
    });
  }

  async create(actor: AuthUser, input: CreateCatalogItemInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.create({
        data: { ...input, meta: input.meta as Prisma.InputJsonValue, createdBy: actor.id, updatedBy: actor.id },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'catalog', entityId: item.id, after: item, meta }, tx);
      return item;
    });
  }

  async update(actor: AuthUser, id: string, input: UpdateCatalogItemInput, meta: RequestMeta) {
    const before = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy mục danh mục');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.update({
        where: { id },
        data: { ...input, meta: input.meta as Prisma.InputJsonValue | undefined, updatedBy: actor.id },
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'catalog', entityId: id, before, after: item, meta }, tx);
      return item;
    });
  }

  /**
   * Kiểm tra các mã danh mục tồn tại. `pairs`: [loại, mã, nhãn trường].
   * Bỏ qua giá trị rỗng. Ném lỗi validate theo đúng tên trường để form hiển thị.
   */
  async assertCodes(pairs: [CatalogType, string | null | undefined, string][], tx: Prisma.TransactionClient = this.prisma) {
    const wanted = pairs.filter(([, code]) => !!code) as [CatalogType, string, string][];
    if (!wanted.length) return;
    const found = await tx.catalogItem.findMany({
      where: { OR: wanted.map(([type, code]) => ({ type, code })) },
      select: { type: true, code: true },
    });
    const ok = new Set(found.map((f) => `${f.type}:${f.code}`));
    const errors: Record<string, string[]> = {};
    for (const [type, code, field] of wanted) {
      if (!ok.has(`${type}:${code}`)) errors[field] = [`Mã "${code}" không có trong danh mục ${CATALOG_TYPES[type].label}`];
    }
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Mã danh mục không hợp lệ', errors });
  }

  /** Bảng tra mã → tên cho các loại danh mục (dùng khi xuất Excel). */
  async nameMaps(types: CatalogType[]): Promise<Record<string, Map<string, string>>> {
    const items = await this.prisma.catalogItem.findMany({ where: { type: { in: types } }, select: { type: true, code: true, name: true } });
    const maps: Record<string, Map<string, string>> = {};
    for (const t of types) maps[t] = new Map();
    for (const i of items) maps[i.type].set(i.code, i.name);
    return maps;
  }
}
