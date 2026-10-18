import { describe, expect, it } from 'vitest';
import { generateTotp, generateTotpSecret, totpUri, verifyTotp } from './totp';

const secret = generateTotpSecret();
const now = Date.UTC(2026, 9, 18, 10, 0, 0);

describe('TOTP', () => {
  it('mã đúng → hợp lệ', () => {
    expect(verifyTotp(secret, generateTotp(secret, now), null, now)).not.toBeNull();
  });

  it('mã của 30 giây trước vẫn chấp nhận (lệch đồng hồ)', () => {
    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), null, now)).not.toBeNull();
  });

  it('mã của 2 phút trước bị từ chối', () => {
    expect(verifyTotp(secret, generateTotp(secret, now - 120_000), null, now)).toBeNull();
  });

  it('không cho dùng lại mã đã dùng', () => {
    const code = generateTotp(secret, now);
    const counter = verifyTotp(secret, code, null, now)!;
    expect(verifyTotp(secret, code, counter, now)).toBeNull();
  });

  it('mã sai định dạng → null', () => {
    expect(verifyTotp(secret, 'abc123', null, now)).toBeNull();
  });

  it('URI cho ứng dụng Authenticator', () => {
    expect(totpUri(secret, 'admin')).toMatch(/^otpauth:\/\/totp\/.*secret=/);
  });
});
