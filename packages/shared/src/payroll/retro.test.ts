import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPONENTS, DEFAULT_PIT_BRACKETS, type ComponentDef } from './payroll';
import { isSalaryVar, pickSalaryVars, retroMonthDiff } from './retro';

const components: ComponentDef[] = DEFAULT_COMPONENTS.map((c, i) => ({ ...c, sortOrder: i + 1 }));

/** Đầu vào đã lưu của một phiếu lương kỳ 08/2026 (lương cơ sở 2.340.000, BH 8 / 1,5 / 1%) */
const stored = {
  BASE_SALARY: '2340000',
  STD_DAYS: '22',
  WORK_UNITS: '22',
  UNPAID_DAYS: '0',
  ABSENT_DAYS: '0',
  DUTY_COUNT: '0',
  DUTY_PAY: '0',
  EXTRA_INCOME: '0',
  RETRO_AMOUNT: '500000', // truy lĩnh cũ đã chi trong kỳ — phải bị loại khi so sánh
  RETRO_INS: '50000',
  DEPENDANTS: '0',
  INS_CAP: '20',
  BHXH_RATE: '8',
  BHYT_RATE: '1.5',
  BHTN_RATE: '1',
  BHXH_ER_RATE: '17.5',
  BHYT_ER_RATE: '3',
  BHTN_ER_RATE: '1',
  UNION_ER_RATE: '2',
  UNION_RATE: '1',
  PIT_SELF: '15500000',
  PIT_DEPENDANT: '6200000',
  IS_COEF: '1',
  IS_FIXED: '0',
  COEF: '2.67',
  BEYOND_PCT: '0',
  FIXED_AMOUNT: '0',
  STAB_COEF: '0',
  MGMT_COEF: '0',
  OTHER_COEF: '0',
  ALLOW_CHUC_VU: '0',
  ALLOW_UU_DAI_NGHE: '40',
  ALLOW_TRACH_NHIEM: '0',
  ALLOW_DOC_HAI: '0',
  ALLOW_KHAC: '0',
};
const paid = pickSalaryVars(stored);

describe('retroMonthDiff', () => {
  it('chọn đúng biến lương', () => {
    expect(isSalaryVar('COEF')).toBe(true);
    expect(isSalaryVar('ALLOW_UU_DAI_NGHE')).toBe(true);
    expect(isSalaryVar('BASE_SALARY')).toBe(false);
    expect(Object.keys(paid)).not.toContain('RETRO_AMOUNT');
  });

  it('không thay đổi → không chênh lệch (bỏ qua truy lĩnh cũ trong kỳ)', () => {
    expect(retroMonthDiff(components, stored, paid, paid, DEFAULT_PIT_BRACKETS)).toMatchObject({ amount: '0', insAmount: '0' });
  });

  it('nâng bậc 2,67 → 3,00 hồi tố: chênh lương + ưu đãi nghề 40%, truy thu BH 10,5%', () => {
    const r = retroMonthDiff(components, stored, paid, { ...paid, COEF: '3.00' }, DEFAULT_PIT_BRACKETS);
    // Lương: 2.340.000 × 0,33 = 772.200; ưu đãi 40% = 308.880 → 1.081.080
    expect(r.amount).toBe('1081080');
    // BH người lao động trên phần lương tăng: 61.776 + 11.583 + 7.722 = 81.081
    expect(r.insAmount).toBe('81081');
    expect(r.oldGross).toBe('8746920');
    expect(r.newGross).toBe('9828000');
  });

  it('tăng phụ cấp ưu đãi nghề 40% → 50%: không phát sinh truy thu BH', () => {
    const r = retroMonthDiff(components, stored, paid, { ...paid, COEF: '3.00', ALLOW_UU_DAI_NGHE: '50' }, DEFAULT_PIT_BRACKETS);
    const base = retroMonthDiff(components, stored, paid, { ...paid, COEF: '3.00' }, DEFAULT_PIT_BRACKETS);
    expect(Number(r.amount) - Number(base.amount)).toBe(702000); // 7.020.000 × 10%
    expect(r.insAmount).toBe(base.insAmount);
  });

  it('dùng lương cơ sở của kỳ cũ, không dùng mức hiện hành', () => {
    const old = { ...stored, BASE_SALARY: '1800000' };
    const r = retroMonthDiff(components, old, pickSalaryVars(old), { ...pickSalaryVars(old), COEF: '3.00' }, DEFAULT_PIT_BRACKETS);
    expect(r.amount).toBe(String(Math.round(1800000 * 0.33 * 1.4))); // 831.600
  });

  it('chuyển lương khoán sang hệ số', () => {
    const fixedPaid = { ...paid, IS_COEF: '0', IS_FIXED: '1', FIXED_AMOUNT: '8000000', ALLOW_UU_DAI_NGHE: '0' };
    const r = retroMonthDiff(components, stored, fixedPaid, { ...fixedPaid, IS_COEF: '1', IS_FIXED: '0', FIXED_AMOUNT: '0' }, DEFAULT_PIT_BRACKETS);
    expect(r.amount).toBe(String(Math.round(2340000 * 2.67) - 8000000)); // âm: thu hồi
  });
});
