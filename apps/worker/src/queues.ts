/**
 * Tên các hàng đợi BullMQ. Mỗi nghiệp vụ chạy nền dùng một hàng đợi riêng
 * để giới hạn concurrency độc lập (vd: đồng bộ máy chấm công không chặn tính lương).
 */
export const QUEUES = {
  system: 'system',
  /** Đồng bộ dữ liệu chấm công từ máy Hikvision — Giai đoạn 3 */
  deviceSync: 'device-sync',
  /** Đồng bộ dữ liệu từ phần mềm Fast — Giai đoạn 2 */
  fastSync: 'fast-sync',
  /** Tính lương, xuất báo cáo nặng — Giai đoạn 4 */
  payroll: 'payroll',
} as const;

export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    // Bắt buộc với BullMQ worker
    maxRetriesPerRequest: null,
  };
}
