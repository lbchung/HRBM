import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/**
 * Mã hóa dữ liệu nhạy cảm ở tầng ứng dụng (AES-256-GCM) + blind index (HMAC-SHA256)
 * để tra cứu / chống trùng mà không lưu bản rõ.
 * Định dạng: "v1:<base64(iv|tag|ciphertext)>"
 */
export class EncryptionService {
  private readonly key: Buffer;
  private readonly indexKey: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY phải là 32 byte dạng base64');
    this.key = key;
    this.indexKey = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'blind-index', 32));
  }

  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')}`;
  }

  decrypt(token: string | null | undefined): string | null {
    if (!token) return null;
    const [version, payload] = token.split(':');
    if (version !== VERSION || !payload) throw new Error('Dữ liệu mã hóa không hợp lệ');
    const buf = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  }

  /** Giá trị băm xác định — cùng đầu vào cho cùng kết quả, dùng cho cột unique/tìm kiếm. */
  blindIndex(value: string | null | undefined): string | null {
    if (!value) return null;
    return createHmac('sha256', this.indexKey).update(value.trim()).digest('hex');
  }
}
