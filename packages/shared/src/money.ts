import Decimal from 'decimal.js';

/**
 * Mọi phép tính tiền / hệ số đi qua module này. KHÔNG dùng number (float) cho tiền.
 * Quy tắc làm tròn tập trung tại đây.
 */
export const Money = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });
export type MoneyValue = Decimal.Value;

/** Làm tròn tiền VNĐ đến đồng (0 chữ số thập phân), làm tròn nửa lên. */
export function roundVnd(value: MoneyValue): Decimal {
  return new Money(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Làm tròn hệ số đến 3 chữ số thập phân. */
export function roundCoefficient(value: MoneyValue): Decimal {
  return new Money(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Tổng an toàn. */
export function sumMoney(values: MoneyValue[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Money(0));
}

/** Định dạng hiển thị kiểu Việt Nam: 1.234.567 */
export function formatVnd(value: MoneyValue): string {
  const fixed = roundVnd(value).toFixed(0);
  const negative = fixed.startsWith('-');
  const digits = negative ? fixed.slice(1) : fixed;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return negative ? `-${grouped}` : grouped;
}
