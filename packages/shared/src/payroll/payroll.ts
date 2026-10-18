import type Decimal from 'decimal.js';
import { Money, roundVnd } from '../money';
import { evaluateFormula, FormulaError, type FormulaVars } from './formula';

export const COMPONENT_KINDS = {
  EARNING: 'Thu nhập',
  DEDUCTION: 'Khấu trừ',
  EMPLOYER: 'Đơn vị đóng',
  INFO: 'Trung gian / thông tin',
} as const;
export type ComponentKind = keyof typeof COMPONENT_KINDS;

export interface ComponentDef {
  code: string;
  name: string;
  kind: ComponentKind;
  formula: string;
  /** Thu nhập chịu thuế TNCN */
  taxable: boolean;
  /** Số chữ số thập phân khi làm tròn (0 = đồng) */
  roundDigits: number;
  sortOrder: number;
}

/**
 * Biến đầu vào có sẵn cho công thức (ngoài kết quả các khoản tính trước, gọi theo mã khoản).
 * Bên tính lương phải cung cấp đủ các biến này cho từng nhân viên.
 */
export const PAYROLL_VARIABLES = {
  BASE_SALARY: 'Lương cơ sở có hiệu lực tại kỳ lương',
  IS_COEF: '1 nếu lương theo hệ số, 0 nếu không',
  IS_FIXED: '1 nếu lương khoán tiền đồng, 0 nếu không',
  COEF: 'Hệ số lương ngạch/bậc',
  BEYOND_PCT: '% phụ cấp thâm niên vượt khung',
  FIXED_AMOUNT: 'Mức lương khoán (đồng/tháng)',
  STD_DAYS: 'Ngày công chuẩn của tháng (tham số chính sách)',
  WORK_UNITS: 'Tổng công thực tế trong tháng (bảng công)',
  UNPAID_DAYS: 'Số ngày nghỉ không hưởng lương (loại phiếu không hưởng lương)',
  ABSENT_DAYS: 'Số ngày vắng không phiếu (K)',
  DUTY_COUNT: 'Số ca trực trong tháng',
  DUTY_PAY: 'Tiền trực trong tháng (theo mức tiền trực hiệu lực)',
  STAB_COEF: 'Hệ số ổn định thu nhập',
  MGMT_COEF: 'Hệ số quản lý',
  OTHER_COEF: 'Hệ số khác',
  EXTRA_INCOME: 'Thu nhập tăng thêm đã duyệt chi trong kỳ',
  RETRO_AMOUNT: 'Tiền truy lĩnh đưa vào kỳ',
  RETRO_INS: 'BHXH/BHYT/BHTN người lao động truy thu theo truy lĩnh',
  DEPENDANTS: 'Số người phụ thuộc đang được giảm trừ',
  INS_CAP: 'Số lần lương cơ sở làm mức trần đóng BHXH',
  BHXH_RATE: '% BHXH người lao động',
  BHYT_RATE: '% BHYT người lao động',
  BHTN_RATE: '% BHTN người lao động',
  BHXH_ER_RATE: '% BHXH đơn vị',
  BHYT_ER_RATE: '% BHYT đơn vị',
  BHTN_ER_RATE: '% BHTN đơn vị',
  UNION_ER_RATE: '% kinh phí công đoàn đơn vị',
  UNION_RATE: '% đoàn phí công đoàn người lao động',
  PIT_SELF: 'Giảm trừ gia cảnh bản thân / tháng',
  PIT_DEPENDANT: 'Giảm trừ mỗi người phụ thuộc / tháng',
  PIT_AMOUNT: 'Thuế TNCN theo biểu lũy tiến, tính trên khoản TN_TINH_THUE (có sau khi tính khoản đó)',
} as const;

/** Phụ cấp của nhân viên được đưa vào công thức dưới dạng ALLOW_<MÃ LOẠI PHỤ CẤP> */
export const allowanceVar = (allowanceTypeCode: string) => `ALLOW_${allowanceTypeCode.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** Hàm tổng dùng được trong công thức: tổng các khoản ĐÃ tính trước khoản hiện tại */
export const PAYROLL_FUNCTIONS = ['SUM_EARNINGS', 'SUM_TAXABLE', 'SUM_DEDUCTIONS', 'SUM_EMPLOYER'] as const;

export interface PayslipLine {
  code: string;
  name: string;
  kind: ComponentKind;
  taxable: boolean;
  amount: string;
}

export interface PayslipResult {
  lines: PayslipLine[];
  gross: string;
  taxable: string;
  deductions: string;
  employerCost: string;
  net: string;
  errors: { code: string; message: string }[];
}

/**
 * Thuế TNCN lũy tiến từng phần theo tháng. Biểu thuế truyền vào (cấu hình theo hiệu lực).
 * brackets: [ngưỡng trên (đồng, null = không giới hạn), thuế suất %]
 */
export function progressiveTax(taxableIncome: Decimal.Value, brackets: { upTo: string | null; rate: string }[]): Decimal {
  let remaining = new Money(taxableIncome);
  if (remaining.lte(0)) return new Money(0);
  let lower = new Money(0);
  let tax = new Money(0);
  for (const b of brackets) {
    const upper = b.upTo === null ? null : new Money(b.upTo);
    const span = upper ? Decimal_min(remaining, upper.minus(lower)) : remaining;
    if (span.lte(0)) break;
    tax = tax.plus(span.times(b.rate).div(100));
    remaining = remaining.minus(span);
    if (!upper || remaining.lte(0)) break;
    lower = upper;
  }
  return tax;
}
const Decimal_min = (a: Decimal, b: Decimal) => (a.lt(b) ? a : b);

/**
 * Tính phiếu lương một nhân viên: duyệt các khoản theo thứ tự, mỗi khoản dùng được biến đầu vào
 * và kết quả các khoản trước (theo mã). Khoản lỗi công thức → 0 + ghi lỗi (không dừng cả bảng lương).
 */
export function computePayslip(
  components: ComponentDef[],
  inputs: FormulaVars,
  pitBrackets: { upTo: string | null; rate: string }[] = [],
): PayslipResult {
  const vars: FormulaVars = { PIT_AMOUNT: 0, ...inputs };
  const lines: PayslipLine[] = [];
  const errors: { code: string; message: string }[] = [];
  const sum = (pred: (l: PayslipLine) => boolean) => lines.filter(pred).reduce((s, l) => s.plus(l.amount), new Money(0));
  const fns = {
    SUM_EARNINGS: () => sum((l) => l.kind === 'EARNING'),
    SUM_TAXABLE: () => sum((l) => l.kind === 'EARNING' && l.taxable),
    SUM_DEDUCTIONS: () => sum((l) => l.kind === 'DEDUCTION'),
    SUM_EMPLOYER: () => sum((l) => l.kind === 'EMPLOYER'),
  };
  for (const c of [...components].sort((a, b) => a.sortOrder - b.sortOrder)) {
    let value: Decimal;
    try {
      value = evaluateFormula(c.formula, vars, fns).toDecimalPlaces(c.roundDigits, Money.ROUND_HALF_UP);
    } catch (e) {
      errors.push({ code: c.code, message: e instanceof FormulaError || e instanceof Error ? e.message : String(e) });
      value = new Money(0);
    }
    vars[c.code] = value;
    lines.push({ code: c.code, name: c.name, kind: c.kind, taxable: c.taxable, amount: value.toString() });
    // Thuế lũy tiến tính trên khoản TN_TINH_THUE → biến PIT_AMOUNT cho các khoản sau
    if (c.code === 'TN_TINH_THUE') vars.PIT_AMOUNT = roundVnd(progressiveTax(value, pitBrackets)).toString();
  }
  const gross = sum((l) => l.kind === 'EARNING');
  const deductions = sum((l) => l.kind === 'DEDUCTION');
  return {
    lines,
    gross: gross.toString(),
    taxable: sum((l) => l.kind === 'EARNING' && l.taxable).toString(),
    deductions: deductions.toString(),
    employerCost: sum((l) => l.kind === 'EMPLOYER').toString(),
    net: gross.minus(deductions).toString(),
    errors,
  };
}

/**
 * Bộ khoản lương mặc định (⚠ TCKT rà soát). Thứ tự quan trọng: khoản sau dùng kết quả khoản trước.
 * Căn cứ chung: NĐ 204/2004 (lương hệ số), TT 02/2012 (ưu đãi nghề tính trên lương + PC chức vụ + vượt khung),
 * Luật BHXH/BHYT/Việc làm (đóng trên lương ngạch bậc + PC chức vụ + vượt khung, trần 20 × LCS).
 */
export const DEFAULT_COMPONENTS: Omit<ComponentDef, 'sortOrder'>[] = [
  { code: 'TY_LE_HUONG', name: 'Tỷ lệ hưởng lương theo ngày công', kind: 'INFO', taxable: false, roundDigits: 10,
    formula: 'if(STD_DAYS > 0, max(0, (STD_DAYS - UNPAID_DAYS - ABSENT_DAYS) / STD_DAYS), 1)' },
  { code: 'LUONG_HS', name: 'Lương theo hệ số', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: 'IS_COEF * BASE_SALARY * COEF * TY_LE_HUONG' },
  { code: 'LUONG_KHOAN', name: 'Lương khoán', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: 'IS_FIXED * FIXED_AMOUNT * TY_LE_HUONG' },
  { code: 'PC_VUOT_KHUNG', name: 'Phụ cấp thâm niên vượt khung', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: 'IS_COEF * BASE_SALARY * COEF * BEYOND_PCT / 100 * TY_LE_HUONG' },
  { code: 'PC_CHUC_VU', name: 'Phụ cấp chức vụ', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: 'BASE_SALARY * ALLOW_CHUC_VU * TY_LE_HUONG' },
  { code: 'PC_UU_DAI_NGHE', name: 'Phụ cấp ưu đãi nghề', kind: 'EARNING', taxable: false, roundDigits: 0,
    formula: 'IS_COEF * BASE_SALARY * (COEF + ALLOW_CHUC_VU + COEF * BEYOND_PCT / 100) * ALLOW_UU_DAI_NGHE / 100 * TY_LE_HUONG' },
  { code: 'PC_TRACH_NHIEM', name: 'Phụ cấp trách nhiệm', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: 'BASE_SALARY * ALLOW_TRACH_NHIEM' },
  { code: 'PC_DOC_HAI', name: 'Phụ cấp độc hại, nguy hiểm', kind: 'EARNING', taxable: false, roundDigits: 0,
    formula: 'BASE_SALARY * ALLOW_DOC_HAI' },
  { code: 'PC_KHAC', name: 'Phụ cấp khác', kind: 'EARNING', taxable: true, roundDigits: 0, formula: 'ALLOW_KHAC' },
  { code: 'TIEN_TRUC', name: 'Tiền trực', kind: 'EARNING', taxable: false, roundDigits: 0, formula: 'DUTY_PAY' },
  { code: 'ON_DINH_TN', name: 'Ổn định thu nhập', kind: 'EARNING', taxable: true, roundDigits: 0,
    formula: '0' /* ⏳ chờ TCKT cung cấp công thức — biến có sẵn: STAB_COEF, MGMT_COEF, OTHER_COEF */ },
  { code: 'TN_TANG_THEM', name: 'Thu nhập tăng thêm', kind: 'EARNING', taxable: true, roundDigits: 0, formula: 'EXTRA_INCOME' },
  { code: 'TRUY_LINH', name: 'Truy lĩnh lương, phụ cấp', kind: 'EARNING', taxable: true, roundDigits: 0, formula: 'RETRO_AMOUNT' },
  { code: 'LUONG_DONG_BH', name: 'Tiền lương đóng bảo hiểm', kind: 'INFO', taxable: false, roundDigits: 0,
    formula: 'min(INS_CAP * BASE_SALARY, IS_COEF * BASE_SALARY * (COEF + ALLOW_CHUC_VU + COEF * BEYOND_PCT / 100) + IS_FIXED * FIXED_AMOUNT)' },
  { code: 'BHXH', name: 'BHXH (người lao động)', kind: 'DEDUCTION', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHXH_RATE / 100' },
  { code: 'BHYT', name: 'BHYT (người lao động)', kind: 'DEDUCTION', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHYT_RATE / 100' },
  { code: 'BHTN', name: 'BHTN (người lao động)', kind: 'DEDUCTION', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHTN_RATE / 100' },
  { code: 'TRUY_THU_BH', name: 'Truy thu bảo hiểm theo truy lĩnh', kind: 'DEDUCTION', taxable: false, roundDigits: 0, formula: 'RETRO_INS' },
  { code: 'DOAN_PHI', name: 'Đoàn phí công đoàn', kind: 'DEDUCTION', taxable: false, roundDigits: 0,
    formula: 'min(LUONG_DONG_BH * UNION_RATE / 100, BASE_SALARY * 10 / 100)' },
  { code: 'TN_TINH_THUE', name: 'Thu nhập tính thuế TNCN', kind: 'INFO', taxable: false, roundDigits: 0,
    formula: 'max(0, SUM_TAXABLE() - BHXH - BHYT - BHTN - TRUY_THU_BH - PIT_SELF - PIT_DEPENDANT * DEPENDANTS)' },
  { code: 'THUE_TNCN', name: 'Thuế TNCN', kind: 'DEDUCTION', taxable: false, roundDigits: 0, formula: 'PIT_AMOUNT' },
  { code: 'BHXH_DV', name: 'BHXH (đơn vị đóng)', kind: 'EMPLOYER', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHXH_ER_RATE / 100' },
  { code: 'BHYT_DV', name: 'BHYT (đơn vị đóng)', kind: 'EMPLOYER', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHYT_ER_RATE / 100' },
  { code: 'BHTN_DV', name: 'BHTN (đơn vị đóng)', kind: 'EMPLOYER', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * BHTN_ER_RATE / 100' },
  { code: 'KPCD_DV', name: 'Kinh phí công đoàn (đơn vị)', kind: 'EMPLOYER', taxable: false, roundDigits: 0, formula: 'LUONG_DONG_BH * UNION_ER_RATE / 100' },
];

/** Biểu thuế TNCN lũy tiến từng phần theo tháng — dữ liệu khởi tạo, cấu hình theo hiệu lực ở Giai đoạn 5. */
export const DEFAULT_PIT_BRACKETS = [
  { upTo: '5000000', rate: '5' },
  { upTo: '10000000', rate: '10' },
  { upTo: '18000000', rate: '15' },
  { upTo: '32000000', rate: '20' },
  { upTo: '52000000', rate: '25' },
  { upTo: '80000000', rate: '30' },
  { upTo: null, rate: '35' },
];
