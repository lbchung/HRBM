import { join } from 'node:path';
import { config } from 'dotenv';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@bachmai/db';
import { QUEUES, redisConnection } from './queues';

config({ path: join(__dirname, '../../../.env') });

const connection = redisConnection(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const prisma = new PrismaClient();

async function main() {
  const systemQueue = new Queue(QUEUES.system, { connection });

  // Heartbeat 5 phút/lần — cùng nhịp với job đồng bộ máy chấm công sau này
  await systemQueue.upsertJobScheduler(
    'heartbeat',
    { every: 5 * 60_000 },
    { name: 'heartbeat', opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  const worker = new Worker(
    QUEUES.system,
    async (job) => {
      switch (job.name) {
        case 'heartbeat': {
          await prisma.$queryRaw`SELECT 1`;
          return { ok: true, at: new Date().toISOString() };
        }
        default:
          throw new Error(`Job không xác định: ${job.name}`);
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('completed', (job) => console.log(`[${QUEUES.system}] ✔ ${job.name} #${job.id}`));
  worker.on('failed', (job, err) => console.error(`[${QUEUES.system}] ✘ ${job?.name} #${job?.id}: ${err.message}`));

  console.log('Worker đã khởi động, hàng đợi:', Object.values(QUEUES).join(', '));

  const shutdown = async () => {
    console.log('Đang dừng worker...');
    await worker.close();
    await systemQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
