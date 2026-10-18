import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type JobsOptions, type Processor, type RepeatOptions } from 'bullmq';

interface Registration {
  queue: string;
  processor: Processor;
  concurrency: number;
}

/**
 * Hàng đợi BullMQ dùng chung. Module đăng ký processor trong onModuleInit;
 * worker chỉ chạy khi APP_ROLE = all | worker (tách tiến trình xử lý nền khi cần mở rộng).
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly registrations: Registration[] = [];
  private readonly schedules: { queue: string; id: string; repeat: Omit<RepeatOptions, 'key'>; name: string; data: unknown }[] = [];
  private readonly connection: { host: string; port: number; password?: string; db: number; maxRetriesPerRequest: null };
  readonly runsWorkers: boolean;

  constructor(config: ConfigService) {
    const u = new URL(config.get('REDIS_URL', 'redis://127.0.0.1:6379'));
    this.connection = {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,
    };
    this.runsWorkers = ['all', 'worker'].includes(config.get('APP_ROLE', 'all'));
  }

  queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: { removeOnComplete: 500, removeOnFail: 2000 },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  add(queue: string, name: string, data: unknown, opts?: JobsOptions) {
    return this.queue(queue).add(name, data, opts);
  }

  /** Đăng ký xử lý job (gọi trong onModuleInit của module nghiệp vụ). */
  process(queue: string, processor: Processor, concurrency = 1) {
    this.registrations.push({ queue, processor, concurrency });
  }

  /** Lịch chạy định kỳ (cron theo giờ VN hoặc every ms). */
  schedule(queue: string, id: string, repeat: Omit<RepeatOptions, 'key'>, name = id, data: unknown = {}) {
    this.schedules.push({ queue, id, repeat, name, data });
  }

  async onApplicationBootstrap() {
    if (!this.runsWorkers) return;
    for (const s of this.schedules) {
      await this.queue(s.queue).upsertJobScheduler(s.id, { tz: 'Asia/Ho_Chi_Minh', ...s.repeat }, { name: s.name, data: s.data });
    }
    for (const r of this.registrations) {
      const w = new Worker(r.queue, r.processor, { connection: this.connection, concurrency: r.concurrency });
      w.on('failed', (job, err) => this.logger.warn(`[${r.queue}] ${job?.name} #${job?.id} lỗi: ${err.message}`));
      this.workers.push(w);
    }
    this.logger.log(`Đã khởi động ${this.workers.length} worker, ${this.schedules.length} lịch chạy định kỳ`);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
