export const QUEUE_DEVICE_SYNC = 'device-sync';
export const QUEUE_TIMESHEET = 'timesheet';

/** Khoảng chồng lấn khi lấy dữ liệu — tránh sót do lệch giờ / độ trễ ghi của máy */
export const SYNC_OVERLAP_MINUTES = 10;
/** Lần đầu đồng bộ một máy mới: lấy lùi N ngày (đủ dữ liệu tháng trước để tính công) */
export const SYNC_INITIAL_DAYS = 31;
/** Máy mất kết nối lâu: lấy bù tối đa N ngày */
export const SYNC_MAX_BACKFILL_DAYS = 31;
/** Số máy đồng bộ song song */
export const SYNC_CONCURRENCY = 5;

export interface RecomputeItem {
  employeeId: string;
  from: string; // YYYY-MM-DD
  to: string;
}
