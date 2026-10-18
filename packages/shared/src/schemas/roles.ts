import { z } from 'zod';
import { DATA_SCOPES } from '../constants/data-scope';
import { ALL_PERMISSION_CODES } from '../constants/permissions';
import { optionalText } from './common';

const permissionCodeSchema = z
  .string()
  .refine((c) => (ALL_PERMISSION_CODES as string[]).includes(c), 'Mã quyền không tồn tại');

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Mã nhóm chỉ gồm chữ in hoa không dấu, số, gạch dưới'),
  name: z.string().trim().min(1, 'Nhập tên nhóm').max(200),
  description: optionalText(500),
  dataScope: z.enum(DATA_SCOPES),
  permissionCodes: z.array(permissionCodeSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.omit({ code: true }).partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
