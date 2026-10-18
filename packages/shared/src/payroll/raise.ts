/**
 * QUY TẮC NÂNG BẬC LƯƠNG THƯỜNG XUYÊN & PHỤ CẤP THÂM NIÊN VƯỢT KHUNG — hàm thuần.
 * Căn cứ chung (⚠ TCCB xác nhận): NĐ 204/2004, TT 08/2013/TT-BNV.
 *  - Chưa xếp bậc cuối: đủ thời gian giữ bậc (36 tháng loại A1 trở lên, 24 tháng loại A0, B) → lên 1 bậc.
 *  - Đã bậc cuối: sau thời gian giữ bậc cuối → hưởng vượt khung 5%; sau đó mỗi 12 tháng +1%.
 *  - Kéo dài thời hạn: theo kỷ luật (số tháng) + nghỉ không lương cộng dồn từ 30 ngày trở lên (cộng số ngày).
 */
export interface SalaryScaleDef {
  code: string;
  /** Hệ số theo bậc, bậc 1 ở vị trí 0 */
  coefficients: string[];
  raiseIntervalMonths: number;
}

export interface RaiseInput {
  scale: SalaryScaleDef;
  currentStep: number;
  beyondScalePercent: number;
  /** Mốc tính thời gian giữ bậc / mức vượt khung hiện tại (YYYY-MM-DD) */
  since: string;
  /** Mốc nâng lương lần sau đã ghi trong hồ sơ (ưu tiên nếu có) */
  nextRaiseDate?: string | null;
  disciplineDelayMonths: number;
  unpaidLeaveDays: number;
}

export type RaiseKind = 'REGULAR' | 'BEYOND_SCALE';

export interface RaiseProposal {
  kind: RaiseKind;
  dueDate: string;
  toStep: number;
  toCoefficient: string;
  toBeyondScalePercent: number;
}

export const BEYOND_SCALE_FIRST_PERCENT = 5;
export const BEYOND_SCALE_YEARLY_MONTHS = 12;

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Đề xuất nâng lương kế tiếp (null nếu dữ liệu không đủ). */
export function nextRaise(input: RaiseInput): RaiseProposal | null {
  const { scale, currentStep, beyondScalePercent } = input;
  const maxStep = scale.coefficients.length;
  if (currentStep < 1 || currentStep > maxStep) return null;
  const atTop = currentStep === maxStep;

  let interval = scale.raiseIntervalMonths;
  if (atTop && beyondScalePercent > 0) interval = BEYOND_SCALE_YEARLY_MONTHS;

  let due = input.nextRaiseDate ?? addMonths(input.since, interval);
  if (!input.nextRaiseDate) {
    due = addMonths(due, input.disciplineDelayMonths);
    if (input.unpaidLeaveDays >= 30) due = addDaysYmd(due, input.unpaidLeaveDays);
  }

  if (!atTop) {
    return { kind: 'REGULAR', dueDate: due, toStep: currentStep + 1, toCoefficient: scale.coefficients[currentStep], toBeyondScalePercent: 0 };
  }
  return {
    kind: 'BEYOND_SCALE',
    dueDate: due,
    toStep: currentStep,
    toCoefficient: scale.coefficients[maxStep - 1],
    toBeyondScalePercent: beyondScalePercent > 0 ? beyondScalePercent + 1 : BEYOND_SCALE_FIRST_PERCENT,
  };
}

/** Mốc nâng lương lần sau tính từ ngày hưởng mới (để ghi vào hồ sơ khi quyết định có hiệu lực). */
export function nextRaiseDateAfter(scale: SalaryScaleDef, step: number, beyondScalePercent: number, effectiveFrom: string): string {
  const atTop = step >= scale.coefficients.length;
  const months = atTop && beyondScalePercent > 0 ? BEYOND_SCALE_YEARLY_MONTHS : scale.raiseIntervalMonths;
  return addMonths(effectiveFrom, months);
}

/**
 * Thang lương mẫu theo NĐ 204/2004 (bảng 3 — viên chức sự nghiệp). ⚠ Dữ liệu khởi tạo, TCCB đối chiếu.
 */
export const DEFAULT_SALARY_SCALES: (SalaryScaleDef & { name: string })[] = [
  { code: 'A3.1', name: 'Viên chức loại A3, nhóm 1 (hạng I)', raiseIntervalMonths: 36, coefficients: ['6.20', '6.56', '6.92', '7.28', '7.64', '8.00'] },
  { code: 'A2.1', name: 'Viên chức loại A2, nhóm 1 (hạng II)', raiseIntervalMonths: 36, coefficients: ['4.40', '4.74', '5.08', '5.42', '5.76', '6.10', '6.44', '6.78'] },
  { code: 'A2.2', name: 'Viên chức loại A2, nhóm 2 (hạng II)', raiseIntervalMonths: 36, coefficients: ['4.00', '4.34', '4.68', '5.02', '5.36', '5.70', '6.04', '6.38'] },
  { code: 'A1', name: 'Viên chức loại A1 (hạng III)', raiseIntervalMonths: 36, coefficients: ['2.34', '2.67', '3.00', '3.33', '3.66', '3.99', '4.32', '4.65', '4.98'] },
  { code: 'A0', name: 'Viên chức loại A0 (cao đẳng)', raiseIntervalMonths: 24, coefficients: ['2.10', '2.41', '2.72', '3.03', '3.34', '3.65', '3.96', '4.27', '4.58', '4.89'] },
  { code: 'B', name: 'Viên chức loại B (hạng IV, trung cấp)', raiseIntervalMonths: 24, coefficients: ['1.86', '2.06', '2.26', '2.46', '2.66', '2.86', '3.06', '3.26', '3.46', '3.66', '3.86', '4.06'] },
];

/** Chức danh nghề nghiệp mẫu → thang lương (gán vào meta.salaryScale của danh mục JOB_TITLE) */
export const DEFAULT_JOB_TITLE_SCALE: Record<string, string> = {
  'V.08.01.01': 'A3.1',
  'V.08.01.02': 'A2.1',
  'V.08.01.03': 'A1',
  'V.08.05.11': 'A2.2',
  'V.08.05.12': 'A1',
  'V.08.05.13': 'B',
  'V.08.06.14': 'A2.2',
  'V.08.06.15': 'A1',
  'V.08.06.16': 'B',
  'V.08.07.17': 'A2.2',
  'V.08.07.18': 'A1',
  'V.08.07.19': 'B',
  'V.08.08.22': 'A2.1',
  'V.08.08.23': 'A1',
  'V.08.08.24': 'B',
  '01.002': 'A2.1',
  '01.003': 'A1',
  '01.004': 'A0',
  '06.031': 'A1',
  '01.005': 'B',
};
