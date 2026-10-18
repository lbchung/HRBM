import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

/** Chính sách mật khẩu: ≥ 8 ký tự, có chữ hoa, chữ thường, chữ số, ký tự đặc biệt. */
export const passwordPolicySchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(128, 'Mật khẩu tối đa 128 ký tự')
  .regex(/[A-Z]/, 'Mật khẩu phải có chữ hoa')
  .regex(/[a-z]/, 'Mật khẩu phải có chữ thường')
  .regex(/[0-9]/, 'Mật khẩu phải có chữ số')
  .regex(/[^A-Za-z0-9]/, 'Mật khẩu phải có ký tự đặc biệt');

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Nhập tên đăng nhập').max(100),
  password: z.string().min(1, 'Nhập mật khẩu').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const otpCode = z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số');

export const login2faSchema = z.object({ challenge: z.string().min(1), code: otpCode });
export type Login2faInput = z.infer<typeof login2faSchema>;

export const enable2faSchema = z.object({ code: otpCode });
export const disable2faSchema = z.object({ password: z.string().min(1, 'Nhập mật khẩu'), code: otpCode });
export type Disable2faInput = z.infer<typeof disable2faSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: passwordPolicySchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
