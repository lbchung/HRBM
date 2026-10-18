import { ForbiddenException, Injectable } from '@nestjs/common';
import { INTEGRATION_ENTITIES, type IntegrationEntity, type RecordSource } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FastClient } from './fast.client';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fast: FastClient,
  ) {}

  async ownership() {
    const rows = await this.prisma.integrationOwnership.findMany();
    const sourceOf = new Map(rows.map((r) => [r.entity, r]));
    return Object.entries(INTEGRATION_ENTITIES).map(([entity, label]) => ({
      entity,
      label,
      source: sourceOf.get(entity)?.source ?? 'FAST',
      updatedAt: sourceOf.get(entity)?.updatedAt ?? null,
    }));
  }

  async setOwnership(actor: AuthUser, entity: IntegrationEntity, source: RecordSource, meta: RequestMeta) {
    const before = await this.prisma.integrationOwnership.findUnique({ where: { entity } });
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationOwnership.upsert({
        where: { entity },
        update: { source, updatedBy: actor.id },
        create: { entity, source, updatedBy: actor.id },
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'integration_ownership', entityId: entity, before, after: { entity, source }, meta }, tx);
    });
  }

  /**
   * Chặn sửa bản ghi đồng bộ từ Fast khi Fast đang là nguồn chuẩn của loại dữ liệu đó.
   * Bản ghi tạo trong hệ thống mới (source = LOCAL) luôn sửa được.
   */
  async assertWritable(entity: IntegrationEntity, recordSource: RecordSource) {
    if (recordSource !== 'FAST') return;
    const row = await this.prisma.integrationOwnership.findUnique({ where: { entity } });
    if ((row?.source ?? 'FAST') === 'FAST') {
      throw new ForbiddenException(
        `${INTEGRATION_ENTITIES[entity]} của bản ghi này do phần mềm Fast quản lý — hãy cập nhật trên Fast, hoặc chuyển nguồn chuẩn sang hệ thống mới.`,
      );
    }
  }

  logs(limit = 50) {
    return this.prisma.integrationSyncLog.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
  }

  status() {
    return { fast: { configured: this.fast.isConfigured() } };
  }

  /** Chạy đồng bộ thủ công. Ghi nhật ký kể cả khi lỗi để theo dõi. */
  async syncNow(actor: AuthUser, entity: IntegrationEntity, meta: RequestMeta) {
    const log = await this.prisma.integrationSyncLog.create({
      data: { integration: 'FAST', entity, trigger: 'MANUAL', status: 'RUNNING', triggeredBy: actor.id },
    });
    try {
      if (entity !== 'hr.employee') throw new Error('Chưa hỗ trợ đồng bộ loại dữ liệu này');
      const last = await this.prisma.integrationSyncLog.findFirst({
        where: { integration: 'FAST', entity, status: 'SUCCESS' },
        orderBy: { startedAt: 'desc' },
      });
      await this.fast.fetchEmployees(last?.startedAt ?? null);
      // TODO(Giai đoạn 2 — khi có API Fast): upsert theo (source=FAST, externalId), tính chênh lệch
      return await this.prisma.integrationSyncLog.update({ where: { id: log.id }, data: { status: 'SUCCESS', finishedAt: new Date() } });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.audit.log({ actor, action: 'SYNC_FAILED', entity: 'integration', entityId: entity, after: { message }, meta });
      return this.prisma.integrationSyncLog.update({ where: { id: log.id }, data: { status: 'FAILED', message, finishedAt: new Date() } });
    }
  }
}
