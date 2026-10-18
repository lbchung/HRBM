export const SHIFT_TYPES = { WORK: 'Ca làm việc', DUTY: 'Ca trực' } as const;
export type ShiftType = keyof typeof SHIFT_TYPES;

export const TIMESHEET_STATUSES = {
  PRESENT: 'Đi làm',
  ABSENT: 'Vắng không phiếu',
  LEAVE: 'Nghỉ có phiếu',
  LEAVE_HALF: 'Nghỉ nửa ngày',
  HOLIDAY: 'Nghỉ lễ',
  MISSING_IN: 'Thiếu giờ vào',
  MISSING_OUT: 'Thiếu giờ ra',
  NO_SCHEDULE: 'Có chấm công, chưa xếp ca',
} as const;
export type TimesheetStatus = keyof typeof TIMESHEET_STATUSES;

/** Ký hiệu bảng công mặc định (ký hiệu nghỉ lấy theo loại phiếu) */
export const TIMESHEET_SYMBOLS = {
  WORK: 'X',
  DUTY: 'T',
  ABSENT: 'K',
  HOLIDAY: 'L',
  MISSING: '?',
} as const;

export const PERIOD_STATUSES = { OPEN: 'Đang mở', CONFIRMED: 'Đơn vị đã xác nhận', CLOSED: 'Đã chốt' } as const;
export type PeriodStatus = keyof typeof PERIOD_STATUSES;

export const LEAVE_STATUSES = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as const;
export type LeaveStatus = keyof typeof LEAVE_STATUSES;

export const HALF_DAYS = { AM: 'Sáng', PM: 'Chiều' } as const;
export type HalfDay = keyof typeof HALF_DAYS;

export const DEVICE_SYNC_STATUSES = { OK: 'Bình thường', ERROR: 'Lỗi', RUNNING: 'Đang đồng bộ' } as const;

/** Máy coi là mất kết nối nếu không đồng bộ thành công trong N phút */
export const DEVICE_OFFLINE_AFTER_MINUTES = 15;
/** Cảnh báo lệch giờ máy so với máy chủ (giây) */
export const DEVICE_CLOCK_DRIFT_WARN_SECONDS = 120;
