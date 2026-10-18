import { describe, expect, it } from 'vitest';
import { detectAllowedType } from './file-type';

describe('detectAllowedType', () => {
  it('nhận PDF thật', () => {
    expect(detectAllowedType('.pdf', Buffer.from('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
  });
  it('từ chối file .exe', () => {
    expect(detectAllowedType('.exe', Buffer.from('MZ'))).toBeNull();
  });
  it('từ chối file đổi đuôi (.exe đổi thành .pdf)', () => {
    expect(detectAllowedType('.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });
  it('nhận xlsx (zip) và jpg, không phân biệt hoa thường', () => {
    expect(detectAllowedType('.XLSX', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).not.toBeNull();
    expect(detectAllowedType('.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).not.toBeNull();
  });
});
