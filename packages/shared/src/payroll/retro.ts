import { Money } from '../money';
import { computePayslip, type ComponentDef } from './payroll';
import type { FormulaVars } from './formula';

/**
 * TRUY LĨNH — hàm thuần tính chênh lệch một kỳ lương đã chốt.
 * Tham số chính sách của kỳ (lương cơ sở, tỷ lệ BH, giảm trừ…) lấy từ đầu vào ĐÃ LƯU của phiếu lương kỳ đó;
 * chỉ thay các biến lương theo hồ sơ (hệ số, vượt khung, khoán, phụ cấp, hệ số thu nhập).
 */

/** Biến lương lấy từ hồ sơ — phần được thay khi tính truy lĩnh */
export const SALARY_VARS = ['IS_COEF', 'IS_FIXED', 'COEF', 'BEYOND_PCT', 'FIXED_AMOUNT', 'STAB_COEF', 'MGMT_COEF', 'OTHER_COEF'];
export const isSalaryVar = (k: string) => SALARY_VARS.includes(k) || k.startsWith('ALLOW_');
export const pickSalaryVars = (src: Record<string, string>) => Object.fromEntries(Object.entries(src).filter(([k]) => isSalaryVar(k)));

/** Khoản BH người lao động — chênh lệch thành truy thu BH */
export const RETRO_INS_CODES = ['BHXH', 'BHYT', 'BHTN'];

export interface RetroMonthResult {
  oldGross: string;
  newGross: string;
  /** Chênh lệch tổng thu nhập (làm tròn đồng) */
  amount: string;
  /** Chênh lệch BH người lao động phải truy thu */
  insAmount: string;
}

export function retroMonthDiff(
  components: ComponentDef[],
  storedInputs: FormulaVars,
  paidVars: FormulaVars,
  newVars: FormulaVars,
  pitBrackets: { upTo: string | null; rate: string }[] = [],
): RetroMonthResult {
  // Truy lĩnh / truy thu đã có trong kỳ cũ không tính lại
  const base = { ...storedInputs, RETRO_AMOUNT: 0, RETRO_INS: 0 };
  const oldR = computePayslip(components, { ...base, ...paidVars }, pitBrackets);
  const newR = computePayslip(components, { ...base, ...newVars }, pitBrackets);
  const ins = (r: typeof oldR) => r.lines.filter((l) => RETRO_INS_CODES.includes(l.code)).reduce((s, l) => s.plus(l.amount), new Money(0));
  return {
    oldGross: oldR.gross,
    newGross: newR.gross,
    amount: new Money(newR.gross).minus(oldR.gross).toFixed(0),
    insAmount: ins(newR).minus(ins(oldR)).toFixed(0),
  };
}
