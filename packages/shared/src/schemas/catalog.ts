import { z } from 'zod';
import { CATALOG_TYPE_CODES } from '../constants/catalogs';
import { optionalText } from './common';

export const catalogTypeSchema = z.enum(CATALOG_TYPE_CODES as [string, ...string[]]);

export const createCatalogItemSchema = z.object({
  type: catalogTypeSchema,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Nhập mã')
    .max(50)
    .regex(/^[A-Z0-9_.-]+$/, 'Mã chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch'),
  name: z.string().trim().min(1, 'Nhập tên').max(300),
  description: optionalText(500),
  meta: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = createCatalogItemSchema.omit({ type: true, code: true }).partial();
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
