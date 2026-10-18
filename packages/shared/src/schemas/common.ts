import { z } from 'zod';

export const uuidSchema = z.string().uuid('ID không hợp lệ');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Chuỗi rỗng từ form → undefined. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Chuỗi rỗng → null (xóa được giá trị khi cập nhật); không gửi → giữ nguyên. */
export const nullableText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

/** Cho phép null để xóa giá trị khi cập nhật. */
export const nullableUuid = z.union([uuidSchema, z.null()]).optional();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày dạng YYYY-MM-DD → Date (00:00 UTC) — dùng cho cột `@db.Date`. */
export const dateOnlySchema = z
  .string()
  .regex(DATE_RE, 'Ngày không hợp lệ (YYYY-MM-DD)')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Ngày không hợp lệ')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const nullableDate = z
  .union([dateOnlySchema, z.literal('').transform(() => null), z.null()])
  .optional();

/** Số thập phân (tiền, hệ số) — nhận string/number, trả string để Prisma Decimal không mất chính xác. */
export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Số không hợp lệ');

export const nullableDecimal = z
  .union([decimalSchema, z.literal('').transform(() => null), z.null()])
  .optional();

/** Mã danh mục (catalog code) */
export const catalogCodeSchema = z.string().trim().min(1).max(50);
export const nullableCatalogCode = z
  .union([catalogCodeSchema, z.literal('').transform(() => null), z.null()])
  .optional();
