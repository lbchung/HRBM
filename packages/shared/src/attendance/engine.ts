import { Money } from '../money';
import { TIMESHEET_SYMBOLS, type HalfDay, type ShiftType, type TimesheetStatus } from './constants';
import { isOvernight, minutesBetween, toVnDate, vnDateTime } from './time';

/**
 * ENGINE TÍNH CÔNG NGÀY — hàm thuần, không truy cập DB, chạy lại bao nhiêu lần cũng cho cùng kết quả.
 * Quy tắc mặc định (⚠ chờ TCCB xác nhận — docs/business-rules/attendance.md):
 *  - Mỗi ca xếp trong ngày tạo một dòng công. Lượt quét thuộc ca nếu nằm trong cửa sổ
 *    [giờ vào − checkInBefore, giờ ra + checkOutAfter]. Một lượt quét có thể dùng cho 2 ca liền kề.
 *  - Có cả giờ vào và giờ ra → đủ công của ca (đi muộn/về sớm chỉ ghi nhận, không trừ công).
 *  - Chỉ có 1 lượt quét → thiếu giờ vào/ra, 0 công, chờ đơn vị xác nhận (điều chỉnh).
 *  - Không quét, không phiếu → vắng (K), 0 công.
 *  - Phiếu nghỉ: loại "tính công" (công tác, học tập) → đủ công; loại khác → 0 công, ký hiệu theo phiếu.
 *  - Ngày lễ không đi làm → L, 0 công (lương ngày lễ do bảng lương xử lý).
 */
export interface EngineShift {
  id: string;
  code: string;
  type: ShiftType;
  startTime: string; // HH:mm
  endTime: string; // HH:mm — ≤ startTime nghĩa là qua đêm
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
  checkInBeforeMinutes: number;
  checkOutAfterMinutes: number;
  workUnits: string; // số công quy đổi
}

export interface EnginePunch {
  time: Date;
  campusId: string | null;
}

export interface EngineLeave {
  leaveRequestId: string;
  symbol: string;
  countsAsWork: boolean;
  /** Phần ngày nghỉ của NGÀY ĐANG TÍNH */
  session: 'FULL' | HalfDay;
}

export interface EngineInput {
  date: string; // YYYY-MM-DD
  shifts: EngineShift[];
  /** Lượt quét quanh ngày (nên lấy từ ngày D−1 đến D+1 để đủ ca qua đêm) */
  punches: EnginePunch[];
  leave: EngineLeave | null;
  holiday: boolean;
  /** Cơ sở phải làm việc ngày này (theo phân công, mặc định cơ sở gốc) */
  expectedCampusId: string;
}

export interface EngineRow {
  slotKey: string;
  shiftId: string | null;
  status: TimesheetStatus;
  symbol: string;
  workUnits: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  isLate: boolean;
  isEarly: boolean;
  campusId: string | null;
  campusMismatch: boolean;
  leaveRequestId: string | null;
}

const NO_SHIFT = 'NONE';
const half = (units: string) => new Money(units).div(2).toFixed(2);

function emptyRow(slotKey: string, shiftId: string | null): EngineRow {
  return {
    slotKey,
    shiftId,
    status: 'ABSENT',
    symbol: TIMESHEET_SYMBOLS.ABSENT,
    workUnits: '0',
    scheduledStart: null,
    scheduledEnd: null,
    firstIn: null,
    lastOut: null,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    isLate: false,
    isEarly: false,
    campusId: null,
    campusMismatch: false,
    leaveRequestId: null,
  };
}

function withCampus(row: EngineRow, punch: EnginePunch | undefined, expected: string): EngineRow {
  if (!punch?.campusId) return row;
  return { ...row, campusId: punch.campusId, campusMismatch: punch.campusId !== expected };
}

function computeShift(input: EngineInput, s: EngineShift): EngineRow {
  const start = vnDateTime(input.date, s.startTime);
  const end = vnDateTime(input.date, s.endTime, isOvernight(s.startTime, s.endTime) ? 1 : 0);
  const winFrom = start.getTime() - s.checkInBeforeMinutes * 60_000;
  const winTo = end.getTime() + s.checkOutAfterMinutes * 60_000;
  const inWindow = input.punches
    .filter((p) => p.time.getTime() >= winFrom && p.time.getTime() <= winTo)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const row: EngineRow = { ...emptyRow(s.id, s.id), scheduledStart: start, scheduledEnd: end };
  const fullSymbol = s.type === 'DUTY' ? TIMESHEET_SYMBOLS.DUTY : TIMESHEET_SYMBOLS.WORK;
  const leave = input.leave;

  // Nghỉ cả ngày có phiếu
  if (leave?.session === 'FULL' && !inWindow.length) {
    return {
      ...row,
      status: 'LEAVE',
      symbol: leave.symbol,
      workUnits: leave.countsAsWork ? s.workUnits : '0',
      leaveRequestId: leave.leaveRequestId,
    };
  }
  if (!inWindow.length) {
    return input.holiday ? { ...row, status: 'HOLIDAY', symbol: TIMESHEET_SYMBOLS.HOLIDAY } : row;
  }

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const hasPair = minutesBetween(first.time, last.time) >= 1;

  if (!hasPair) {
    const mid = (start.getTime() + end.getTime()) / 2;
    const isIn = first.time.getTime() < mid;
    return withCampus(
      {
        ...row,
        status: isIn ? 'MISSING_OUT' : 'MISSING_IN',
        symbol: TIMESHEET_SYMBOLS.MISSING,
        firstIn: isIn ? first.time : null,
        lastOut: isIn ? null : first.time,
        lateMinutes: isIn ? Math.max(0, minutesBetween(start, first.time)) : 0,
        isLate: isIn && minutesBetween(start, first.time) > s.lateGraceMinutes,
      },
      first,
      input.expectedCampusId,
    );
  }

  const late = Math.max(0, minutesBetween(start, first.time));
  const early = Math.max(0, minutesBetween(last.time, end));
  const overlapStart = Math.max(first.time.getTime(), start.getTime());
  const overlapEnd = Math.min(last.time.getTime(), end.getTime());
  const overlap = Math.max(0, Math.round((overlapEnd - overlapStart) / 60_000));

  const present: EngineRow = {
    ...row,
    status: 'PRESENT',
    symbol: fullSymbol,
    workUnits: s.workUnits,
    firstIn: first.time,
    lastOut: last.time,
    workedMinutes: Math.max(0, overlap - s.breakMinutes),
    lateMinutes: late,
    earlyMinutes: early,
    isLate: late > s.lateGraceMinutes,
    isEarly: early > s.earlyGraceMinutes,
  };

  // Nghỉ nửa ngày + đi làm nửa còn lại: nửa công làm + (nửa công nếu phiếu tính công)
  if (leave && leave.session !== 'FULL') {
    const units = new Money(half(s.workUnits)).plus(leave.countsAsWork ? half(s.workUnits) : 0).toFixed(2);
    return withCampus(
      {
        ...present,
        status: 'LEAVE_HALF',
        symbol: `${fullSymbol}/${leave.symbol}`,
        workUnits: units,
        // Nghỉ buổi sáng thì không tính đi muộn; nghỉ buổi chiều thì không tính về sớm
        isLate: leave.session === 'AM' ? false : present.isLate,
        isEarly: leave.session === 'PM' ? false : present.isEarly,
        leaveRequestId: leave.leaveRequestId,
      },
      first,
      input.expectedCampusId,
    );
  }
  return withCampus(present, first, input.expectedCampusId);
}

export function computeDay(input: EngineInput): EngineRow[] {
  if (input.shifts.length) return input.shifts.map((s) => computeShift(input, s));

  // Không xếp ca
  const sameDay = input.punches
    .filter((p) => toVnDate(p.time) === input.date)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  const row = emptyRow(NO_SHIFT, null);
  if (input.leave) {
    const full = input.leave.session === 'FULL';
    return [
      {
        ...row,
        status: full ? 'LEAVE' : 'LEAVE_HALF',
        symbol: input.leave.symbol,
        workUnits: input.leave.countsAsWork ? (full ? '1' : '0.5') : '0',
        leaveRequestId: input.leave.leaveRequestId,
      },
    ];
  }
  if (sameDay.length) {
    const first = sameDay[0];
    const last = sameDay[sameDay.length - 1];
    return [
      withCampus(
        {
          ...row,
          status: 'NO_SCHEDULE',
          symbol: TIMESHEET_SYMBOLS.MISSING,
          firstIn: first.time,
          lastOut: sameDay.length > 1 ? last.time : null,
          workedMinutes: sameDay.length > 1 ? minutesBetween(first.time, last.time) : 0,
        },
        first,
        input.expectedCampusId,
      ),
    ];
  }
  if (input.holiday) return [{ ...row, status: 'HOLIDAY', symbol: TIMESHEET_SYMBOLS.HOLIDAY }];
  return [];
}

// ======================= TỔNG HỢP THÁNG =======================

export interface MonthRowInput {
  symbol: string;
  workUnits: string;
  status: TimesheetStatus;
  isLate: boolean;
  isEarly: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  campusId: string | null;
  expectedCampusId: string;
  shiftType: ShiftType | null;
}

export interface MonthTotals {
  workUnits: string;
  dutyCount: number;
  dutyUnits: string;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  absentCount: number;
  missingCount: number;
  bySymbol: Record<string, number>;
  /** Số công theo cơ sở thực tế làm việc (không có lượt quét → tính cho cơ sở phải làm) */
  unitsByCampus: Record<string, string>;
}

/** Tổng hợp công tháng từ các dòng công ngày (đã áp dụng điều chỉnh thủ công). */
export function aggregateMonth(rows: MonthRowInput[]): MonthTotals {
  let units = new Money(0);
  let dutyUnits = new Money(0);
  const byCampus: Record<string, InstanceType<typeof Money>> = {};
  const t: MonthTotals = {
    workUnits: '0',
    dutyCount: 0,
    dutyUnits: '0',
    lateCount: 0,
    lateMinutes: 0,
    earlyCount: 0,
    earlyMinutes: 0,
    absentCount: 0,
    missingCount: 0,
    bySymbol: {},
    unitsByCampus: {},
  };
  for (const r of rows) {
    const u = new Money(r.workUnits || 0);
    units = units.plus(u);
    if (r.shiftType === 'DUTY' && u.gt(0)) {
      t.dutyCount++;
      dutyUnits = dutyUnits.plus(u);
    }
    if (r.isLate) {
      t.lateCount++;
      t.lateMinutes += r.lateMinutes;
    }
    if (r.isEarly) {
      t.earlyCount++;
      t.earlyMinutes += r.earlyMinutes;
    }
    if (r.status === 'ABSENT') t.absentCount++;
    if (r.status === 'MISSING_IN' || r.status === 'MISSING_OUT' || r.status === 'NO_SCHEDULE') t.missingCount++;
    t.bySymbol[r.symbol] = (t.bySymbol[r.symbol] ?? 0) + 1;
    const campus = r.campusId ?? r.expectedCampusId;
    byCampus[campus] = (byCampus[campus] ?? new Money(0)).plus(u);
  }
  t.workUnits = units.toFixed(2);
  t.dutyUnits = dutyUnits.toFixed(2);
  t.unitsByCampus = Object.fromEntries(Object.entries(byCampus).map(([k, v]) => [k, v.toFixed(2)]));
  return t;
}

// ======================= PHIẾU NGHỈ =======================

/**
 * Số ngày nghỉ của phiếu: đếm ngày lịch từ `from` đến `to`, trừ ngày lễ,
 * nửa ngày khi bắt đầu buổi chiều / kết thúc buổi sáng.
 * (⚠ Chưa trừ ngày nghỉ hằng tuần — nhân viên y tế làm theo lịch trực; chờ TCCB xác nhận.)
 */
export function leaveDays(from: string, to: string, startSession: HalfDay, endSession: HalfDay, holidays: Set<string>): number {
  let total = 0;
  for (let d = from; d <= to; d = nextDay(d)) {
    if (holidays.has(d)) continue;
    let v = 1;
    if (d === from && startSession === 'PM') v -= 0.5;
    if (d === to && endSession === 'AM') v -= 0.5;
    total += Math.max(0, v);
  }
  return total;
}

/** Phần ngày nghỉ của một ngày cụ thể trong phiếu */
export function leaveSessionOn(date: string, from: string, to: string, startSession: HalfDay, endSession: HalfDay): 'FULL' | HalfDay | null {
  if (date < from || date > to) return null;
  const startsPm = date === from && startSession === 'PM';
  const endsAm = date === to && endSession === 'AM';
  if (startsPm && endsAm) return null; // phiếu không hợp lệ (chiều → sáng cùng ngày)
  if (startsPm) return 'PM';
  if (endsAm) return 'AM';
  return 'FULL';
}

function nextDay(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Ngày phép năm theo thâm niên: cơ bản + 1 ngày cho mỗi đủ 5 năm (Điều 114 BLLĐ 2019 — ⚠ TCCB xác nhận). */
export function annualLeaveEntitlement(baseDays: number, startDate: string | null, year: number): number {
  if (!startDate) return baseDays;
  // Thâm niên tính đến 31/12 của năm xét (số năm tròn)
  const years = year - Number(startDate.slice(0, 4));
  return baseDays + Math.max(0, Math.floor(years / 5));
}
