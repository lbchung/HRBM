/**
 * Tham số chính sách có ngày hiệu lực (bảng `policy_parameters`).
 * Giá trị tại một ngày = phiên bản có effectiveFrom lớn nhất ≤ ngày đó.
 * KHÔNG hard-code các giá trị này trong code tính toán — luôn đọc qua PolicyService.
 */
export type ParameterUnit = 'VND' | 'PERCENT' | 'COEFFICIENT' | 'DAYS' | 'NUMBER';

export interface PolicyParameterDef {
  code: string;
  name: string;
  group: string;
  unit: ParameterUnit;
  description?: string;
}

export const PARAMETER_UNIT_LABELS: Record<ParameterUnit, string> = {
  VND: 'đồng',
  PERCENT: '%',
  COEFFICIENT: 'hệ số',
  DAYS: 'ngày',
  NUMBER: '',
};

export const POLICY_PARAMETERS = [
  { code: 'BASE_SALARY', name: 'Lương cơ sở', group: 'Tiền lương', unit: 'VND' },
  { code: 'STANDARD_WORK_DAYS', name: 'Ngày công chuẩn / tháng (tính tỷ lệ hưởng lương)', group: 'Tiền lương', unit: 'DAYS' },
  {
    code: 'INSURANCE_CAP_MULTIPLIER',
    name: 'Mức trần đóng BHXH, BHYT (số lần lương cơ sở)',
    group: 'Bảo hiểm',
    unit: 'NUMBER',
  },
  { code: 'BHXH_EMPLOYEE_RATE', name: 'BHXH — người lao động đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'BHYT_EMPLOYEE_RATE', name: 'BHYT — người lao động đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'BHTN_EMPLOYEE_RATE', name: 'BHTN — người lao động đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'BHXH_EMPLOYER_RATE', name: 'BHXH — đơn vị đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'BHYT_EMPLOYER_RATE', name: 'BHYT — đơn vị đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'BHTN_EMPLOYER_RATE', name: 'BHTN — đơn vị đóng', group: 'Bảo hiểm', unit: 'PERCENT' },
  { code: 'UNION_FEE_EMPLOYER_RATE', name: 'Kinh phí công đoàn — đơn vị đóng', group: 'Công đoàn', unit: 'PERCENT' },
  { code: 'UNION_FEE_EMPLOYEE_RATE', name: 'Đoàn phí công đoàn — người lao động', group: 'Công đoàn', unit: 'PERCENT' },
  { code: 'PIT_SELF_DEDUCTION', name: 'Giảm trừ gia cảnh bản thân / tháng', group: 'Thuế TNCN', unit: 'VND' },
  { code: 'PIT_DEPENDANT_DEDUCTION', name: 'Giảm trừ người phụ thuộc / tháng', group: 'Thuế TNCN', unit: 'VND' },
  { code: 'ANNUAL_LEAVE_BASE_DAYS', name: 'Số ngày phép năm cơ bản', group: 'Chấm công', unit: 'DAYS' },
] as const satisfies readonly PolicyParameterDef[];

export type PolicyParameterCode = (typeof POLICY_PARAMETERS)[number]['code'];
export const POLICY_PARAMETER_CODES = POLICY_PARAMETERS.map((p) => p.code) as PolicyParameterCode[];

export interface ParameterVersion {
  effectiveFrom: string; // YYYY-MM-DD
  value: string;
}

/** Chọn phiên bản có hiệu lực tại `date` (YYYY-MM-DD). Danh sách không cần sắp xếp. */
export function pickEffective<T extends ParameterVersion>(versions: T[], date: string): T | undefined {
  let best: T | undefined;
  for (const v of versions) {
    if (v.effectiveFrom <= date && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  }
  return best;
}
