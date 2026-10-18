import * as OTPAuth from 'otpauth';

const ISSUER = 'BV Bach Mai HRM';
const PERIOD = 30;

const totpFor = (secretBase32: string, label: string) =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, username: string): string {
  return totpFor(secretBase32, username).toString();
}

/**
 * Kiểm tra mã 6 số (cho phép lệch ±1 bước = ±30 giây).
 * Trả về số bước thời gian của mã nếu hợp lệ và CHƯA dùng (lớn hơn `lastCounter`); ngược lại null.
 */
export function verifyTotp(secretBase32: string, token: string, lastCounter: number | null, now = Date.now()): number | null {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const delta = totpFor(secretBase32, 'x').validate({ token: clean, window: 1, timestamp: now });
  if (delta === null) return null;
  const counter = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastCounter !== null && counter <= lastCounter) return null; // chống dùng lại mã
  return counter;
}

/** Sinh mã tại thời điểm — chỉ dùng cho test. */
export function generateTotp(secretBase32: string, now = Date.now()): string {
  return totpFor(secretBase32, 'x').generate({ timestamp: now });
}
