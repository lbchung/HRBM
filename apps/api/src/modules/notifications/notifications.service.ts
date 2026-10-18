import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotificationInput {
  title: string;
  body?: string | null;
  /** Đường dẫn trong web app, vd /approvals?open=<id> */
  link?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: string[], n: NotificationInput, tx: Prisma.TransactionClient = this.prisma) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await tx.notification.createMany({
      data: ids.map((userId) => ({ userId, title: n.title.slice(0, 300), body: n.body?.slice(0, 1000), link: n.link })),
    });
  }

  async list(userId: string) {
    const [items, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  markRead(userId: string, id?: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
  }
}
