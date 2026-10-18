import { z } from 'zod';
import { HALF_DAYS, SHIFT_TYPES } from '../attendance/constants';
import { dateOnlySchema, decimalSchema, nullableText, nullableUuid, optionalText, paginationSchema, uuidSchema } from './common';
import { queryBool } from './hr';

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:mm');
const code = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Nhập mã')
  .max(20)
  .regex(/^[A-Z0-9_.-]+$/, 'Mã chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM');

// ======================= MÁY CHẤM CÔNG =======================

export const deviceBaseSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên máy').max(200),
  campusId: uuidSchema,
  location: nullableText(300),
  host: z
    .string()
    .trim()
    .min(1, 'Nhập địa chỉ IP / tên máy')
    .max(200)
    .regex(/^[A-Za-z0-9.-]+$/, 'Địa chỉ không hợp lệ'),
  port: z.coerce.number().int().min(1).max(65535).default(80),
  useHttps: z.boolean().default(false),
  username: z.string().trim().min(1, 'Nhập tài khoản máy').max(100),
  /** Bỏ trống khi sửa = giữ mật khẩu cũ */
  password: z.string().max(200).optional(),
  /** Mã sự kiện minor được tính là chấm công, cách nhau dấu phẩy (75 = xác thực khuôn mặt thành công) */
  eventMinors: z
    .string()
    .trim()
    .regex(/^\d+(,\s*\d+)*$/, 'Danh sách số, cách nhau dấu phẩy')
    .default('75'),
  isActive: z.boolean().default(true),
});
export const createDeviceSchema = deviceBaseSchema.extend({
  code,
  password: z.string().min(1, 'Nhập mật khẩu máy').max(200),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export const updateDeviceSchema = deviceBaseSchema.partial();
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const listPunchesQuerySchema = paginationSchema.extend({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  deviceId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  unmapped: queryBool,
  export: z.enum(['xlsx']).optional(),
});
export type ListPunchesQuery = z.infer<typeof listPunchesQuerySchema>;

export const mapEmployeeNoSchema = z.object({
  employeeNo: z.string().trim().min(1).max(50),
  employeeId: uuidSchema,
});

// ======================= CA LÀM VIỆC / CA TRỰC =======================

export const shiftBaseSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên ca').max(200),
  type: z.enum(keys(SHIFT_TYPES)),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.coerce.number().int().min(0).max(600).default(0),
  lateGraceMinutes: z.coerce.number().int().min(0).max(240).default(5),
  earlyGraceMinutes: z.coerce.number().int().min(0).max(240).default(5),
  checkInBeforeMinutes: z.coerce.number().int().min(0).max(720).default(120),
  checkOutAfterMinutes: z.coerce.number().int().min(0).max(720).default(240),
  workUnits: decimalSchema.default('1'),
  color: nullableText(20),
  campusId: nullableUuid,
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export const createShiftSchema = shiftBaseSchema.extend({ code });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export const updateShiftSchema = shiftBaseSchema.partial();
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const createDutyRateSchema = z.object({
  effectiveFrom: dateOnlySchema,
  amount: decimalSchema,
  legalBasis: optionalText(500),
  note: optionalText(1000),
});
export type CreateDutyRateInput = z.infer<typeof createDutyRateSchema>;

export const holidaySchema = z.object({
  date: dateOnlySchema,
  name: z.string().trim().min(1, 'Nhập tên ngày lễ').max(200),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

// ======================= LỊCH LÀM VIỆC / LỊCH TRỰC =======================

export const scheduleGridQuerySchema = z.object({
  unitId: uuidSchema,
  month,
  /** WORK = lịch làm việc, DUTY = lịch trực, bỏ trống = tất cả */
  shiftType: z.enum(keys(SHIFT_TYPES)).optional(),
});
export type ScheduleGridQuery = z.infer<typeof scheduleGridQuerySchema>;

/** Gán ca cho từng ô (nhân viên × ngày). shiftIds rỗng = xóa ca của ô đó (trong phạm vi shiftType). */
export const setScheduleCellsSchema = z.object({
  shiftType: z.enum(keys(SHIFT_TYPES)).optional(),
  cells: z
    .array(z.object({ employeeId: uuidSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), shiftIds: z.array(uuidSchema).max(4) }))
    .min(1)
    .max(5000),
});
export type SetScheduleCellsInput = z.infer<typeof setScheduleCellsSchema>;

/** Áp một ca cho nhiều nhân viên theo các thứ trong tuần trong khoảng ngày */
export const applySchedulePatternSchema = z.object({
  employeeIds: z.array(uuidSchema).min(1).max(1000),
  shiftId: uuidSchema,
  from: dateOnlySchema,
  to: dateOnlySchema,
  /** 0 = CN … 6 = T7 */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  replace: z.boolean().default(true),
});
export type ApplySchedulePatternInput = z.infer<typeof applySchedulePatternSchema>;

/** Sao chép lịch một tuần sang các tuần tiếp theo */
export const copyScheduleWeekSchema = z.object({
  unitId: uuidSchema,
  sourceWeekStart: dateOnlySchema,
  targetWeekStarts: z.array(dateOnlySchema).min(1).max(8),
  shiftType: z.enum(keys(SHIFT_TYPES)).optional(),
});
export type CopyScheduleWeekInput = z.infer<typeof copyScheduleWeekSchema>;

// ======================= PHIẾU NGHỈ =======================

export const leaveTypeBaseSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên loại phiếu').max(200),
  symbol: z.string().trim().min(1, 'Nhập ký hiệu').max(10),
  paid: z.boolean().default(true),
  countsAsWork: z.boolean().default(false),
  deductAnnualLeave: z.boolean().default(false),
  requiresAttachment: z.boolean().default(false),
  workflowCode: z.string().trim().min(1).max(50).default('LEAVE_DEFAULT'),
  maxDaysPerRequest: z.union([z.literal('').transform(() => null), z.null(), z.coerce.number().int().min(1).max(366)]).optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export const createLeaveTypeSchema = leaveTypeBaseSchema.extend({ code });
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export const updateLeaveTypeSchema = leaveTypeBaseSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const createLeaveRequestSchema = z
  .object({
    employeeId: uuidSchema,
    leaveTypeId: uuidSchema,
    fromDate: dateOnlySchema,
    toDate: dateOnlySchema,
    startSession: z.enum(keys(HALF_DAYS)).default('AM'),
    endSession: z.enum(keys(HALF_DAYS)).default('PM'),
    reason: z.string().trim().min(1, 'Nhập lý do').max(1000),
    destination: nullableText(300),
    fileId: nullableUuid,
    /** Người duyệt cho các bước SELECTED của quy trình: { "1": [userId] } */
    selectedApprovers: z.record(z.array(uuidSchema)).default({}),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'Đến ngày phải sau từ ngày', path: ['toDate'] })
  .refine((v) => !(v.fromDate.getTime() === v.toDate.getTime() && v.startSession === 'PM' && v.endSession === 'AM'), {
    message: 'Buổi kết thúc không hợp lệ',
    path: ['endSession'],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const listLeaveRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  leaveTypeId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  mine: queryBool,
});
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;

export const leaveBalanceQuerySchema = paginationSchema.extend({
  year: z.coerce.number().int().min(2000).max(2100),
  unitId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
});
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>;

export const updateLeaveBalanceSchema = z.object({
  entitledDays: decimalSchema.optional(),
  carriedOverDays: decimalSchema.optional(),
  adjustmentDays: decimalSchema.optional(),
  note: optionalText(500),
});
export type UpdateLeaveBalanceInput = z.infer<typeof updateLeaveBalanceSchema>;

// ======================= BẢNG CÔNG =======================

export const timesheetQuerySchema = z.object({
  unitId: uuidSchema,
  month,
  includeSubUnits: queryBool,
  export: z.enum(['xlsx']).optional(),
});
export type TimesheetQuery = z.infer<typeof timesheetQuerySchema>;

export const recomputeSchema = z.object({
  unitId: uuidSchema,
  month,
});

export const adjustTimesheetSchema = z.object({
  /** Bỏ trống cả hai = gỡ điều chỉnh, quay về kết quả tính tự động */
  symbol: z.union([z.string().trim().min(1).max(10), z.null()]),
  workUnits: z.union([decimalSchema, z.null()]),
  reason: z.string().trim().min(1, 'Nhập lý do điều chỉnh').max(500),
});
export type AdjustTimesheetInput = z.infer<typeof adjustTimesheetSchema>;

export const periodActionSchema = z.object({
  unitIds: z.array(uuidSchema).min(1).max(500),
  month,
  note: optionalText(500),
});
export type PeriodActionInput = z.infer<typeof periodActionSchema>;

export const attendanceReportQuerySchema = paginationSchema.extend({
  month: month.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  unitId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  export: z.enum(['xlsx']).optional(),
});
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;
