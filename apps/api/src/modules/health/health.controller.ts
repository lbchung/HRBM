import { Controller, Get, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('Hệ thống')
@Controller('health')
export class HealthController implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.redis = new Redis(config.get('REDIS_URL', 'redis://127.0.0.1:6379'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  @Public()
  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.redis.ping().then(() => 'up').catch(() => 'down'),
    ]);
    return { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', db, redis, time: new Date().toISOString() };
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
