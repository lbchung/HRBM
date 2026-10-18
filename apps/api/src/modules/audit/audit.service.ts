import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import type { ListAuditLogsQuery } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Các trường không bao giờ ghi vào audit log. */
const REDACTED_KEYS = new Set([
  'passwordHash',
  'totpSecret',
  'refreshTokenHash',
  'idNumberEnc',
  'idNumberHash',
  'taxCodeEnc',
  'bankAccountEnc',
  'searchText',
]);

export interface AuditEntry {
  actor?: Pick<AuthUser, 'id' | 'username'> | null;
  /** Dùng khi chưa xác thực (vd: đăng nhập sai) */
  username?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta;
}

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (REDACTED_KEYS.has(key)) return undefined;
      return typeof v === 'bigint' ? v.toString() : v;
    }),
  );
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi audit. Truyền `tx` để ghi cùng transaction với thay đổi dữ liệu. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        userId: entry.actor?.id,
        username: entry.actor?.username ?? entry.username,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? undefined,
        before: sanitize(entry.before),
        after: sanitize(entry.after),
        ip: entry.meta?.ip,
        userAgent: entry.meta?.userAgent,
      },
    });
  }

  async list(q: ListAuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = {
      entity: q.entity,
      action: q.action,
      userId: q.userId,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      ...(q.search
        ? {
            OR: [
              { username: { contains: q.search, mode: 'insensitive' } },
              { entityId: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, ...toSkipTake(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({ ...r, id: r.id.toString() })),
      total,
      q,
    );
  }
}
