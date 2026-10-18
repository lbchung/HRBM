import dayjs, { type Dayjs } from 'dayjs';

export const formatDateTime = (v?: string | Date | null) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
export const formatDate = (v?: string | Date | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');

/** Cột kiểu ngày (`@db.Date`, API trả "YYYY-MM-DDT00:00:00.000Z") → DD/MM/YYYY, không lệch múi giờ. */
export const formatDay = (v?: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');

/** Ngày từ API → dayjs cho DatePicker */
export const toDayjs = (v?: string | null): Dayjs | undefined => (v ? dayjs(v.slice(0, 10)) : undefined);

/** dayjs từ DatePicker → "YYYY-MM-DD" gửi API ('' = xóa giá trị) */
export const fromDayjs = (d?: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');

/** 1234567.5 → "1.234.567,5" */
export const formatNumber = (v?: string | number | null, maxFraction = 3) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: maxFraction });
