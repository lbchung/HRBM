import { z } from 'zod';
import { nullableUuid, optionalText, paginationSchema, uuidSchema } from './common';
import { passwordPolicySchema } from './auth';

export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
  DISABLED: 'Vô hiệu hóa',
};

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
  .max(50, 'Tên đăng nhập tối đa 50 ký tự')
  .regex(/^[a-z0-9._-]+$/, 'Chỉ dùng chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới');

export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(200),
  email: z
    .string()
    .trim()
    .email('Email không hợp lệ')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: optionalText(20),
  campusId: nullableUuid,
  unitId: nullableUuid,
  roleIds: z.array(uuidSchema).min(1, 'Chọn ít nhất một nhóm tài khoản'),
  managedUnitIds: z.array(uuidSchema).default([]),
  /** Bỏ trống → hệ thống sinh mật khẩu tạm. */
  password: passwordPolicySchema.optional().or(z.literal('').transform(() => undefined)),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ username: true, password: true })
  .partial()
  .extend({ status: z.enum(['ACTIVE', 'DISABLED']).optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  status: z.enum(USER_STATUSES).optional(),
  campusId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  roleId: uuidSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
