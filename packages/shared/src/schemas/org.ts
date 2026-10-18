import { z } from 'zod';
import { nullableUuid, optionalText, paginationSchema, uuidSchema } from './common';

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Nhập mã')
  .max(20)
  .regex(/^[A-Z0-9_.-]+$/, 'Mã chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch');

export const createCampusSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, 'Nhập tên cơ sở').max(200),
  address: optionalText(500),
  phone: optionalText(50),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateCampusInput = z.infer<typeof createCampusSchema>;
export const updateCampusSchema = createCampusSchema.omit({ code: true }).partial();
export type UpdateCampusInput = z.infer<typeof updateCampusSchema>;

export const UNIT_TYPES = ['KHOA', 'PHONG', 'TRUNG_TAM', 'VIEN', 'KHAC'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  KHOA: 'Khoa',
  PHONG: 'Phòng',
  TRUNG_TAM: 'Trung tâm',
  VIEN: 'Viện',
  KHAC: 'Khác',
};

export const createUnitSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1, 'Nhập tên đơn vị').max(200),
  shortName: optionalText(50),
  type: z.enum(UNIT_TYPES),
  parentId: nullableUuid,
  campusId: nullableUuid,
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export const updateUnitSchema = createUnitSchema.omit({ code: true }).partial();
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export const listAuditLogsQuerySchema = paginationSchema.extend({
  entity: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  userId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
