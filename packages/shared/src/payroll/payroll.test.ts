import { describe, expect, it } from 'vitest';
import { computePayslip, DEFAULT_COMPONENTS, DEFAULT_PIT_BRACKETS, progressiveTax, type ComponentDef } from './payroll';
import { DEFAULT_SALARY_SCALES, nextRaise, nextRaiseDateAfter } from './raise';

const components: ComponentDef[] = DEFAULT_COMPONENTS.map((c, i) => ({ ...c, sortOrder: i + 1 }));

const baseInputs = {
  BASE_SALARY: 2340000,
  IS_COEF: 1,
  IS_FIXED: 0,
  COEF: '4.98',
  BEYOND_PCT: 0,
  FIXED_AMOUNT: 0,
  STD_DAYS: 22,
  WORK_UNITS: 22,
  UNPAID_DAYS: 0,
  ABSENT_DAYS: 0,
  DUTY_COUNT: 0,
  DUTY_PAY: 0,
  STAB_COEF: 0,
  MGMT_COEF: 0,
  OTHER_COEF: 0,
  EXTRA_INCOME: 0,
  RETRO_AMOUNT: 0,
  RETRO_INS: 0,
  DEPENDANTS: 0,
  INS_CAP: 20,
  BHXH_RATE: 8,
  BHYT_RATE: '1.5',
  BHTN_RATE: 1,
  BHXH_ER_RATE: '17.5',
  BHYT_ER_RATE: 3,
  BHTN_ER_RATE: 1,
  UNION_ER_RATE: 2,
  UNION_RATE: 1,
  PIT_SELF: 15500000,
  PIT_DEPENDANT: 6200000,
  ALLOW_CHUC_VU: 0,
  ALLOW_UU_DAI_NGHE: 0,
  ALLOW_TRACH_NHIEM: 0,
  ALLOW_DOC_HAI: 0,
  ALLOW_KHAC: 0,
};

const line = (r: ReturnType<typeof computePayslip>, code: string) => r.lines.find((l) => l.code === code)!.amount;

describe('computePayslip — bộ khoản mặc định', () => {
  it('bác sĩ hệ số 4,98, đủ công, không phụ cấp', () => {
    const r = computePayslip(components, baseInputs, DEFAULT_PIT_BRACKETS);
    expect(r.errors).toEqual([]);
    expect(line(r, 'LUONG_HS')).toBe('11653200'); // 2.340.000 × 4,98
    expect(line(r, 'BHXH')).toBe('932256'); // 8%
    expect(line(r, 'BHYT')).toBe('174798'); // 1,5%
    expect(line(r, 'BHTN')).toBe('116532'); // 1%
    expect(line(r, 'DOAN_PHI')).toBe('116532'); // 1%, dưới trần 10% LCS
    expect(r.gross).toBe('11653200');
    // Thu nhập tính thuế = 11.653.200 − BH 1.223.586 − 15.500.000 < 0 → 0
    expect(line(r, 'THUE_TNCN')).toBe('0');
    expect(r.net).toBe('10313082');
    expect(line(r, 'BHXH_DV')).toBe('2039310');
  });

  it('phụ cấp chức vụ 0,7 + ưu đãi nghề 40% + vượt khung 7%', () => {
    const r = computePayslip(components, { ...baseInputs, ALLOW_CHUC_VU: '0.7', ALLOW_UU_DAI_NGHE: 40, BEYOND_PCT: 7 }, DEFAULT_PIT_BRACKETS);
    expect(line(r, 'PC_CHUC_VU')).toBe('1638000');
    expect(line(r, 'PC_VUOT_KHUNG')).toBe('815724');
    // Ưu đãi nghề = 2.340.000 × (4,98 + 0,7 + 0,3486) × 40% = 5.642.769,6 → 5.642.770
    expect(line(r, 'PC_UU_DAI_NGHE')).toBe('5642770');
    // Đóng BH trên lương + chức vụ + vượt khung
    expect(line(r, 'LUONG_DONG_BH')).toBe('14106924');
  });

  it('nghỉ không lương 2/22 ngày → tỷ lệ hưởng', () => {
    const r = computePayslip(components, { ...baseInputs, UNPAID_DAYS: 2 }, DEFAULT_PIT_BRACKETS);
    expect(line(r, 'LUONG_HS')).toBe('10593818'); // 11.653.200 × 20/22
  });

  it('lương khoán', () => {
    const r = computePayslip(components, { ...baseInputs, IS_COEF: 0, IS_FIXED: 1, COEF: 0, FIXED_AMOUNT: 9000000 }, DEFAULT_PIT_BRACKETS);
    expect(line(r, 'LUONG_HS')).toBe('0');
    expect(line(r, 'LUONG_KHOAN')).toBe('9000000');
    expect(line(r, 'BHXH')).toBe('720000');
  });

  it('trần đóng BHXH 20 × lương cơ sở', () => {
    const r = computePayslip(components, { ...baseInputs, COEF: '30' }, DEFAULT_PIT_BRACKETS);
    expect(line(r, 'LUONG_DONG_BH')).toBe('46800000');
  });

  it('thu nhập cao → có thuế TNCN', () => {
    const r = computePayslip(components, { ...baseInputs, EXTRA_INCOME: 20000000 }, DEFAULT_PIT_BRACKETS);
    // TNTT = 31.653.200 − 1.223.586 − 15.500.000 = 14.929.614
    expect(line(r, 'TN_TINH_THUE')).toBe('14929614');
    // 5% × 5tr + 10% × 5tr + 15% × 4.929.614 = 250.000 + 500.000 + 739.442,1
    expect(line(r, 'THUE_TNCN')).toBe('1489442');
  });

  it('công thức lỗi không dừng bảng lương', () => {
    const r = computePayslip([{ code: 'X', name: 'X', kind: 'EARNING', taxable: true, roundDigits: 0, sortOrder: 1, formula: 'KHONG_CO * 2' }], {});
    expect(r.errors[0].code).toBe('X');
    expect(line(r, 'X')).toBe('0');
  });
});

describe('progressiveTax', () => {
  it.each([
    ['0', '0'],
    ['5000000', '250000'],
    ['10000000', '750000'],
    ['100000000', '29150000'], // 0,25+0,5+1,2+2,8+5+8,4+7 = 25,15tr... kiểm tra theo bậc
  ])('%s → %s', (income, tax) => {
    if (income === '100000000') {
      // 5%×5 + 10%×5 + 15%×8 + 20%×14 + 25%×20 + 30%×28 + 35%×20 (triệu)
      expect(progressiveTax(income, DEFAULT_PIT_BRACKETS).toString()).toBe(String((0.25 + 0.5 + 1.2 + 2.8 + 5 + 8.4 + 7) * 1_000_000));
      return;
    }
    expect(progressiveTax(income, DEFAULT_PIT_BRACKETS).toString()).toBe(tax);
  });
});

describe('nâng lương', () => {
  const A1 = DEFAULT_SALARY_SCALES.find((s) => s.code === 'A1')!;
  const B = DEFAULT_SALARY_SCALES.find((s) => s.code === 'B')!;

  it('A1 bậc 3 → bậc 4 sau 36 tháng', () => {
    expect(nextRaise({ scale: A1, currentStep: 3, beyondScalePercent: 0, since: '2023-07-01', disciplineDelayMonths: 0, unpaidLeaveDays: 0 })).toEqual({
      kind: 'REGULAR', dueDate: '2026-07-01', toStep: 4, toCoefficient: '3.33', toBeyondScalePercent: 0,
    });
  });

  it('loại B nâng sau 24 tháng', () => {
    expect(nextRaise({ scale: B, currentStep: 1, beyondScalePercent: 0, since: '2025-01-01', disciplineDelayMonths: 0, unpaidLeaveDays: 0 })?.dueDate).toBe('2027-01-01');
  });

  it('kỷ luật khiển trách kéo dài 6 tháng; nghỉ không lương ≥ 30 ngày cộng thêm', () => {
    const r = nextRaise({ scale: A1, currentStep: 3, beyondScalePercent: 0, since: '2023-07-01', disciplineDelayMonths: 6, unpaidLeaveDays: 45 });
    expect(r?.dueDate).toBe('2027-02-15');
  });

  it('nghỉ không lương dưới 30 ngày không ảnh hưởng', () => {
    expect(nextRaise({ scale: A1, currentStep: 3, beyondScalePercent: 0, since: '2023-07-01', disciplineDelayMonths: 0, unpaidLeaveDays: 20 })?.dueDate).toBe('2026-07-01');
  });

  it('bậc cuối → vượt khung 5%, sau đó +1%/năm', () => {
    const first = nextRaise({ scale: A1, currentStep: 9, beyondScalePercent: 0, since: '2022-03-01', disciplineDelayMonths: 0, unpaidLeaveDays: 0 });
    expect(first).toMatchObject({ kind: 'BEYOND_SCALE', dueDate: '2025-03-01', toBeyondScalePercent: 5, toCoefficient: '4.98' });
    const next = nextRaise({ scale: A1, currentStep: 9, beyondScalePercent: 5, since: '2025-03-01', disciplineDelayMonths: 0, unpaidLeaveDays: 0 });
    expect(next).toMatchObject({ dueDate: '2026-03-01', toBeyondScalePercent: 6 });
  });

  it('mốc trong hồ sơ được ưu tiên', () => {
    expect(nextRaise({ scale: A1, currentStep: 2, beyondScalePercent: 0, since: '2020-01-01', nextRaiseDate: '2026-11-01', disciplineDelayMonths: 6, unpaidLeaveDays: 0 })?.dueDate).toBe('2026-11-01');
  });

  it('ngày cuối tháng không bị tràn sang tháng sau', () => {
    expect(nextRaiseDateAfter(A1, 2, 0, '2023-08-31')).toBe('2026-08-31');
    expect(nextRaiseDateAfter(B, 2, 0, '2024-02-29')).toBe('2026-02-28');
  });
});
