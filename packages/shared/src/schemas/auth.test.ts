import { describe, expect, it } from 'vitest';
import { changePasswordSchema, passwordPolicySchema } from './auth';
import { widestScope } from '../constants/data-scope';

describe('passwordPolicySchema', () => {
  it.each(['BachMai@2026', 'Abcdef1!'])('chấp nhận %s', (pw) => {
    expect(passwordPolicySchema.safeParse(pw).success).toBe(true);
  });

  it.each(['alllowercase1!', 'ALLUPPER1!', 'NoDigits!!', 'NoSpecial11'])('từ chối %s', (pw) => {
    expect(passwordPolicySchema.safeParse(pw).success).toBe(false);
  });

  it('từ chối mật khẩu < 8 ký tự', () => {
    expect(passwordPolicySchema.safeParse('Ab1!xyz').success).toBe(false);
  });

  it('mật khẩu mới phải khác mật khẩu cũ', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'BachMai@2026',
      newPassword: 'BachMai@2026',
    });
    expect(r.success).toBe(false);
  });
});

describe('widestScope', () => {
  it('chọn phạm vi rộng nhất', () => {
    expect(widestScope(['SELF', 'UNIT'])).toBe('UNIT');
    expect(widestScope(['UNIT', 'ALL', 'CAMPUS'])).toBe('ALL');
    expect(widestScope([])).toBe('SELF');
  });
});
