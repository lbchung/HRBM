import { randomInt } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '@#$%&*!';

const pick = (chars: string) => chars[randomInt(chars.length)];

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Hash giả để so sánh khi không tìm thấy tài khoản — tránh lộ thông tin qua thời gian phản hồi. */
  private dummyHash = '';

  async onModuleInit() {
    this.dummyHash = await hash('dummy-password-for-timing');
  }

  hash(plain: string) {
    return hash(plain); // argon2id, tham số mặc định của @node-rs/argon2
  }

  async verify(passwordHash: string | null, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash ?? this.dummyHash, plain);
    } catch {
      return false;
    }
  }

  /** Mật khẩu tạm 12 ký tự, luôn thỏa chính sách mật khẩu. */
  generateTemporary(): string {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
    const all = UPPER + LOWER + DIGITS;
    while (chars.length < 12) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
