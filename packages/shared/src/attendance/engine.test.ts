import { describe, expect, it } from 'vitest';
import { aggregateMonth, annualLeaveEntitlement, computeDay, leaveDays, leaveSessionOn, type EngineInput, type EngineShift } from './engine';
import { eachDay, monthRange, toVnDate, toVnTime, vnDateTime } from './time';

const HN = 'campus-hn';
const NB = 'campus-nb';

const HC: EngineShift = {
  id: 'hc',
  code: 'HC',
  type: 'WORK',
  startTime: '07:30',
  endTime: '16:30',
  breakMinutes: 60,
  lateGraceMinutes: 5,
  earlyGraceMinutes: 5,
  checkInBeforeMinutes: 120,
  checkOutAfterMinutes: 240,
  workUnits: '1',
};
const DUTY24: EngineShift = { ...HC, id: 't24', code: 'T24', type: 'DUTY', startTime: '07:30', endTime: '07:30', breakMinutes: 0, workUnits: '1' };
const NIGHT: EngineShift = { ...HC, id: 'dem', code: 'DEM', startTime: '16:30', endTime: '07:30', breakMinutes: 0 };

const p = (date: string, hhmm: string, campusId = HN, addDays = 0) => ({ time: vnDateTime(date, hhmm, addDays), campusId });
const D = '2026-10-19';
const base = (over: Partial<EngineInput>): EngineInput => ({
  date: D,
  shifts: [HC],
  punches: [],
  leave: null,
  holiday: false,
  expectedCampusId: HN,
  ...over,
});

describe('giờ Việt Nam', () => {
  it('07:30 VN = 00:30 UTC; đổi ngược lại đúng', () => {
    const t = vnDateTime('2026-10-19', '07:30');
    expect(t.toISOString()).toBe('2026-10-19T00:30:00.000Z');
    expect(toVnDate(t)).toBe('2026-10-19');
    expect(toVnTime(t)).toBe('07:30');
  });
  it('00:30 VN thuộc ngày VN dù là 17:30 UTC hôm trước', () => {
    expect(toVnDate(new Date('2026-10-18T17:30:00Z'))).toBe('2026-10-19');
  });
  it('khoảng ngày của tháng', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('computeDay — ca hành chính 07:30–16:30', () => {
  it('đúng giờ → X, 1 công, giờ làm trừ nghỉ trưa', () => {
    const [r] = computeDay(base({ punches: [p(D, '07:20'), p(D, '12:00'), p(D, '16:40')] }));
    expect(r).toMatchObject({ status: 'PRESENT', symbol: 'X', workUnits: '1', isLate: false, isEarly: false, workedMinutes: 480 });
    expect(toVnTime(r.firstIn!)).toBe('07:20');
    expect(toVnTime(r.lastOut!)).toBe('16:40');
  });

  it.each([
    ['07:35', false, 5],
    ['07:36', true, 6],
    ['08:15', true, 45],
  ])('vào %s → đi muộn=%s (%i phút)', (inTime, late, minutes) => {
    const [r] = computeDay(base({ punches: [p(D, inTime), p(D, '16:30')] }));
    expect(r.isLate).toBe(late);
    expect(r.lateMinutes).toBe(minutes);
    expect(r.workUnits).toBe('1'); // đi muộn không trừ công
  });

  it('về sớm 16:00 → isEarly, 30 phút', () => {
    const [r] = computeDay(base({ punches: [p(D, '07:25'), p(D, '16:00')] }));
    expect(r).toMatchObject({ isEarly: true, earlyMinutes: 30 });
  });

  it('chỉ quét buổi sáng → thiếu giờ ra, 0 công', () => {
    const [r] = computeDay(base({ punches: [p(D, '07:28')] }));
    expect(r).toMatchObject({ status: 'MISSING_OUT', symbol: '?', workUnits: '0' });
  });

  it('chỉ quét buổi chiều → thiếu giờ vào', () => {
    const [r] = computeDay(base({ punches: [p(D, '16:35')] }));
    expect(r.status).toBe('MISSING_IN');
  });

  it('quét ngoài cửa sổ ca (03:00) không tính', () => {
    const [r] = computeDay(base({ punches: [p(D, '03:00')] }));
    expect(r.status).toBe('ABSENT');
  });

  it('không quét, không phiếu → K', () => {
    expect(computeDay(base({}))[0]).toMatchObject({ status: 'ABSENT', symbol: 'K', workUnits: '0' });
  });

  it('ngày lễ không đi làm → L', () => {
    expect(computeDay(base({ holiday: true }))[0]).toMatchObject({ status: 'HOLIDAY', symbol: 'L' });
  });
});

describe('computeDay — phiếu nghỉ', () => {
  it('nghỉ phép cả ngày → P, 0 công', () => {
    const [r] = computeDay(base({ leave: { leaveRequestId: 'l1', symbol: 'P', countsAsWork: false, session: 'FULL' } }));
    expect(r).toMatchObject({ status: 'LEAVE', symbol: 'P', workUnits: '0', leaveRequestId: 'l1' });
  });

  it('đi công tác cả ngày → CT, đủ công', () => {
    const [r] = computeDay(base({ leave: { leaveRequestId: 'l2', symbol: 'CT', countsAsWork: true, session: 'FULL' } }));
    expect(r).toMatchObject({ symbol: 'CT', workUnits: '1' });
  });

  it('nghỉ phép buổi sáng, chiều đi làm → X/P, 0,5 công, không tính đi muộn', () => {
    const [r] = computeDay(
      base({ punches: [p(D, '12:55'), p(D, '16:35')], leave: { leaveRequestId: 'l3', symbol: 'P', countsAsWork: false, session: 'AM' } }),
    );
    expect(r).toMatchObject({ status: 'LEAVE_HALF', symbol: 'X/P', workUnits: '0.50', isLate: false });
  });
});

describe('computeDay — ca trực & qua đêm', () => {
  it('trực 24h 07:30 → 07:30 hôm sau', () => {
    const [r] = computeDay(base({ shifts: [DUTY24], punches: [p(D, '07:15'), p(D, '07:40', HN, 1)] }));
    expect(r).toMatchObject({ status: 'PRESENT', symbol: 'T', isLate: false, isEarly: false });
    expect(r.workedMinutes).toBe(24 * 60);
  });

  it('ca hành chính + trực đêm cùng ngày: một lượt quét 16:32 dùng cho cả hai ca', () => {
    const rows = computeDay(base({ shifts: [HC, NIGHT], punches: [p(D, '07:25'), p(D, '16:32'), p(D, '07:35', HN, 1)] }));
    expect(rows.map((r) => r.status)).toEqual(['PRESENT', 'PRESENT']);
    expect(rows[1].isLate).toBe(false);
  });
});

describe('computeDay — cơ sở làm việc', () => {
  it('quét tại Ninh Bình khi được phân công Hà Nội → cảnh báo', () => {
    const [r] = computeDay(base({ punches: [p(D, '07:25', NB), p(D, '16:35', NB)] }));
    expect(r).toMatchObject({ campusId: NB, campusMismatch: true });
  });
  it('quét đúng cơ sở phân công → không cảnh báo', () => {
    const [r] = computeDay(base({ expectedCampusId: NB, punches: [p(D, '07:25', NB), p(D, '16:35', NB)] }));
    expect(r.campusMismatch).toBe(false);
  });
});

describe('computeDay — không xếp ca', () => {
  it('có quét → NO_SCHEDULE để đơn vị xử lý', () => {
    const [r] = computeDay(base({ shifts: [], punches: [p(D, '08:00'), p(D, '17:00')] }));
    expect(r).toMatchObject({ slotKey: 'NONE', status: 'NO_SCHEDULE', workUnits: '0' });
  });
  it('không quét, không phiếu, không lễ → không có dòng', () => {
    expect(computeDay(base({ shifts: [] }))).toEqual([]);
  });
});

describe('aggregateMonth', () => {
  it('tổng công, đi muộn, theo cơ sở', () => {
    const row = (o: Partial<Parameters<typeof aggregateMonth>[0][number]>) => ({
      symbol: 'X', workUnits: '1', status: 'PRESENT' as const, isLate: false, isEarly: false, lateMinutes: 0, earlyMinutes: 0,
      campusId: HN, expectedCampusId: HN, shiftType: 'WORK' as const, ...o,
    });
    const t = aggregateMonth([
      row({}),
      row({ isLate: true, lateMinutes: 12 }),
      row({ campusId: NB }),
      row({ symbol: 'T', shiftType: 'DUTY' }),
      row({ symbol: 'P', workUnits: '0', status: 'LEAVE', campusId: null }),
      row({ symbol: 'K', workUnits: '0', status: 'ABSENT', campusId: null }),
    ]);
    expect(t).toMatchObject({ workUnits: '4.00', dutyCount: 1, lateCount: 1, lateMinutes: 12, absentCount: 1 });
    expect(t.bySymbol).toEqual({ X: 3, T: 1, P: 1, K: 1 });
    expect(t.unitsByCampus).toEqual({ [HN]: '3.00', [NB]: '1.00' });
  });
});

describe('phiếu nghỉ', () => {
  const holidays = new Set(['2026-09-02']);
  it.each([
    ['2026-10-19', '2026-10-21', 'AM', 'PM', 3],
    ['2026-10-19', '2026-10-21', 'PM', 'PM', 2.5],
    ['2026-10-19', '2026-10-21', 'PM', 'AM', 2],
    ['2026-10-19', '2026-10-19', 'AM', 'AM', 0.5],
    ['2026-09-01', '2026-09-03', 'AM', 'PM', 2], // trừ lễ 02/09
  ] as const)('%s → %s (%s/%s) = %d ngày', (f, t, s, e, n) => {
    expect(leaveDays(f, t, s, e, holidays)).toBe(n);
  });

  it('phần ngày nghỉ của từng ngày', () => {
    expect(leaveSessionOn('2026-10-19', '2026-10-19', '2026-10-21', 'PM', 'PM')).toBe('PM');
    expect(leaveSessionOn('2026-10-20', '2026-10-19', '2026-10-21', 'PM', 'AM')).toBe('FULL');
    expect(leaveSessionOn('2026-10-21', '2026-10-19', '2026-10-21', 'PM', 'AM')).toBe('AM');
    expect(leaveSessionOn('2026-10-22', '2026-10-19', '2026-10-21', 'AM', 'PM')).toBeNull();
  });

  it('phép năm theo thâm niên: +1 ngày mỗi 5 năm', () => {
    expect(annualLeaveEntitlement(12, '2022-03-01', 2026)).toBe(12);
    expect(annualLeaveEntitlement(12, '2021-03-01', 2026)).toBe(13);
    expect(annualLeaveEntitlement(12, '2010-01-01', 2026)).toBe(15);
    expect(annualLeaveEntitlement(12, null, 2026)).toBe(12);
  });
});
