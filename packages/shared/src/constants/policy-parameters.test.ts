import { describe, expect, it } from 'vitest';
import { pickEffective } from './policy-parameters';

const versions = [
  { effectiveFrom: '2024-07-01', value: '2340000' },
  { effectiveFrom: '2023-07-01', value: '1800000' },
];

describe('pickEffective', () => {
  it('lấy phiên bản mới nhất có hiệu lực', () => {
    expect(pickEffective(versions, '2025-01-15')?.value).toBe('2340000');
  });
  it('ngày hiệu lực là chính ngày bắt đầu', () => {
    expect(pickEffective(versions, '2024-07-01')?.value).toBe('2340000');
    expect(pickEffective(versions, '2024-06-30')?.value).toBe('1800000');
  });
  it('trước mọi phiên bản → undefined', () => {
    expect(pickEffective(versions, '2020-01-01')).toBeUndefined();
  });
});
