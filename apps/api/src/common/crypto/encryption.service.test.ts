import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.service';

const svc = new EncryptionService(randomBytes(32).toString('base64'));

describe('EncryptionService', () => {
  it('mã hóa rồi giải mã ra đúng bản rõ', () => {
    const enc = svc.encrypt('001203004567')!;
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('001203004567');
    expect(svc.decrypt(enc)).toBe('001203004567');
  });

  it('mỗi lần mã hóa cho kết quả khác nhau (IV ngẫu nhiên)', () => {
    expect(svc.encrypt('abc')).not.toBe(svc.encrypt('abc'));
  });

  it('blind index ổn định, khác khóa thì khác kết quả', () => {
    expect(svc.blindIndex('001203004567')).toBe(svc.blindIndex(' 001203004567 '));
    const other = new EncryptionService(randomBytes(32).toString('base64'));
    expect(other.blindIndex('001203004567')).not.toBe(svc.blindIndex('001203004567'));
  });

  it('phát hiện dữ liệu bị sửa (GCM auth tag)', () => {
    const enc = svc.encrypt('secret')!;
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A') + '=';
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('rỗng → null', () => {
    expect(svc.encrypt('')).toBeNull();
    expect(svc.decrypt(null)).toBeNull();
    expect(svc.blindIndex(undefined)).toBeNull();
  });

  it('từ chối khóa sai độ dài', () => {
    expect(() => new EncryptionService(randomBytes(16).toString('base64'))).toThrow();
  });
});
