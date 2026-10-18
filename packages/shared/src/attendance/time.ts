/**
 * Giờ Việt Nam (UTC+7, không có giờ mùa hè). Ngày công, giờ ca đều tính theo giờ VN;
 * thời điểm lưu DB là UTC (timestamptz). Cột ngày (`@db.Date`) lưu 00:00 UTC của ngày đó.
 */
export const VN_OFFSET_MINUTES = 7 * 60;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

/** "YYYY-MM-DD" của thời điểm theo giờ VN */
export function toVnDate(t: Date): string {
  return new Date(t.getTime() + VN_OFFSET_MINUTES * MS_PER_MIN).toISOString().slice(0, 10);
}

/** "HH:mm" của thời điểm theo giờ VN */
export function toVnTime(t: Date): string {
  return new Date(t.getTime() + VN_OFFSET_MINUTES * MS_PER_MIN).toISOString().slice(11, 16);
}

/** Thời điểm UTC tương ứng ngày `ymd` + giờ `hhmm` giờ VN (+ addDays) */
export function vnDateTime(ymd: string, hhmm: string, addDays = 0): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays, h, mi) - VN_OFFSET_MINUTES * MS_PER_MIN);
}

/** Cột `@db.Date` (00:00 UTC) ↔ "YYYY-MM-DD" */
export const dateColumn = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  return ymdOf(new Date(dateColumn(ymd).getTime() + n * MS_PER_DAY));
}

/** Danh sách ngày từ `from` đến `to` (bao gồm hai đầu) */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Ngày đầu / cuối tháng "YYYY-MM" */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Thứ trong tuần theo ngày (0 = Chủ nhật … 6 = Thứ bảy) */
export const weekdayOf = (ymd: string) => dateColumn(ymd).getUTCDay();

export const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_PER_MIN);

/** Giờ kết thúc ≤ giờ bắt đầu → ca qua đêm */
export const isOvernight = (start: string, end: string) => end <= start;
