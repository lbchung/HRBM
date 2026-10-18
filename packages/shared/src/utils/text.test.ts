import { describe, expect, it } from 'vitest';
import { maskSensitive, normalizeSearch } from './text';

describe('normalizeSearch', () => {
  it.each([
    ['Nguyễn Văn Đức', 'nguyen van duc'],
    ['  TRẦN   Thị  Hồng  ', 'tran thi hong'],
    ['Phòng Tổ chức cán bộ', 'phong to chuc can bo'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected);
  });
});

describe('maskSensitive', () => {
  it('che trừ 4 ký tự cuối', () => {
    expect(maskSensitive('001203004567')).toBe('********4567');
  });
  it('chuỗi ngắn che toàn bộ', () => {
    expect(maskSensitive('123')).toBe('***');
  });
  it('null → null', () => {
    expect(maskSensitive(null)).toBeNull();
  });
});
