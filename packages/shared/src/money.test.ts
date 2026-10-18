import { describe, expect, it } from 'vitest';
import { Money, formatVnd, roundCoefficient, roundVnd, sumMoney } from './money';

describe('money', () => {
  it.each([
    ['1234.5', '1235'],
    ['1234.49', '1234'],
    ['-1234.5', '-1235'],
    ['0', '0'],
  ])('roundVnd(%s) = %s', (input, expected) => {
    expect(roundVnd(input).toFixed(0)).toBe(expected);
  });

  it('không sai số float: 0.1 + 0.2', () => {
    expect(sumMoney(['0.1', '0.2']).toString()).toBe('0.3');
  });

  it('hệ số × lương cơ sở', () => {
    // 2,34 × 2.340.000 = 5.475.600
    expect(roundVnd(new Money('2.34').times(2_340_000)).toFixed(0)).toBe('5475600');
  });

  it('roundCoefficient làm tròn 3 chữ số', () => {
    expect(roundCoefficient('4.98666').toString()).toBe('4.987');
  });

  it.each([
    [5475600, '5.475.600'],
    [0, '0'],
    [-1500, '-1.500'],
    [999, '999'],
  ])('formatVnd(%s) = %s', (input, expected) => {
    expect(formatVnd(input)).toBe(expected);
  });
});
