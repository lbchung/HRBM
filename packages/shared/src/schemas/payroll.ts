import { z } from 'zod';
import { COMPONENT_KINDS } from '../payroll/payroll';
import { dateOnlySchema, decimalSchema, nullableDate, nullableText, optionalText, paginationSchema, uuidSchema } from './common';

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM');

export const componentBaseSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên khoản').max(200),
  kind: z.enum(keys(COMPONENT_KINDS)),
  formula: z.string().trim().min(1, 'Nhập công thức').max(2000),
  taxable: z.boolean().default(false),
  roundDigits: z.coerce.number().int().min(0).max(10).default(0),
  sortOrder: z.coerce.number().int().default(0),
  showOnPayslip: z.boolean().default(true),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});
export const createComponentSchema = componentBaseSchema.extend({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Mã bắt đầu bằng chữ, chỉ gồm chữ in hoa, số, gạch dưới'),
});
export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export const updateComponentSchema = componentBaseSchema.partial();
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;

export const testFormulaSchema = z.object({
  formula: z.string().min(1).max(2000),
  employeeId: uuidSchema.optional(),
  month: month.optional(),
});

export const updateScaleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  raiseIntervalMonths: z.coerce.number().int().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  coefficients: z.array(decimalSchema).min(1).max(30).optional(),
});
export type UpdateScaleInput = z.infer<typeof updateScaleSchema>;

export const createScaleSchema = updateScaleSchema.required({ name: true, raiseIntervalMonths: true, coefficients: true }).extend({
  code: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9.]+$/, 'Mã thang lương không hợp lệ'),
});
export type CreateScaleInput = z.infer<typeof createScaleSchema>;

export const pitBracketsSchema = z.object({
  effectiveFrom: dateOnlySchema,
  brackets: z
    .array(z.object({ upTo: z.union([decimalSchema, z.null()]), rate: decimalSchema }))
    .min(1)
    .max(15)
    .refine((b) => b[b.length - 1].upTo === null, 'Bậc cuối không giới hạn trên (để trống)'),
  legalBasis: optionalText(500),
});
export type PitBracketsInput = z.infer<typeof pitBracketsSchema>;

// -------- Kỳ lương --------

export const createRunSchema = z.object({
  month,
  name: z.string().trim().min(1).max(200),
  note: optionalText(1000),
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

export const listRunItemsQuerySchema = paginationSchema.extend({
  unitId: uuidSchema.optional(),
  campusId: uuidSchema.optional(),
  hasErrors: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type ListRunItemsQuery = z.infer<typeof listRunItemsQuerySchema>;

// -------- Nâng lương --------

export const raiseDueQuerySchema = z.object({
  /** Đến hạn trong khoảng [from, to] */
  from: dateOnlySchema,
  to: dateOnlySchema,
  unitId: uuidSchema.optional(),
});
export type RaiseDueQuery = z.infer<typeof raiseDueQuerySchema>;

export const createRaisesSchema = z.object({
  items: z
    .array(
      z.object({
        employeeId: uuidSchema,
        kind: z.enum(['REGULAR', 'EARLY', 'BEYOND_SCALE']),
        toStep: z.coerce.number().int().min(1).max(30),
        toCoefficient: decimalSchema,
        toBeyondPct: decimalSchema.default('0'),
        dueDate: dateOnlySchema,
        effectiveDate: dateOnlySchema,
        reason: nullableText(1000),
      }),
    )
    .min(1)
    .max(2000),
});
export type CreateRaisesInput = z.infer<typeof createRaisesSchema>;

export const decideRaisesSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(2000),
  approve: z.boolean(),
  decisionNo: nullableText(100),
  decisionDate: nullableDate,
});
export type DecideRaisesInput = z.infer<typeof decideRaisesSchema>;

export const listRaisesQuerySchema = paginationSchema.extend({
  status: z.enum(['PROPOSED', 'APPROVED', 'REJECTED']).optional(),
  unitId: uuidSchema.optional(),
  export: z.enum(['xlsx']).optional(),
});
export type ListRaisesQuery = z.infer<typeof listRaisesQuerySchema>;

// -------- Thu nhập tăng thêm --------

export const createExtraIncomeSchema = z.object({
  unitId: uuidSchema,
  month,
  title: z.string().trim().min(1, 'Nhập nội dung').max(300),
  note: optionalText(1000),
  lines: z
    .array(z.object({ employeeId: uuidSchema, amount: decimalSchema, note: optionalText(300) }))
    .min(1, 'Thêm ít nhất một nhân viên')
    .max(2000),
});
export type CreateExtraIncomeInput = z.infer<typeof createExtraIncomeSchema>;

export const listExtraIncomeQuerySchema = paginationSchema.extend({
  month: month.optional(),
  unitId: uuidSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PAID']).optional(),
});
export type ListExtraIncomeQuery = z.infer<typeof listExtraIncomeQuerySchema>;
