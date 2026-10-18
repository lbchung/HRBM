import { Injectable } from '@nestjs/common';
import {
  Money,
  aggregateMonth,
  allowanceVar,
  dateColumn,
  monthRange,
  pickEffective,
  ymdOf,
  type MonthTotals,
  type PolicyParameterCode,
} from '@bachmai/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftsService } from '../attendance/shifts.service';
import { effective } from '../attendance/timesheet.service';
import { PolicyService } from '../policy/policy.service';

export interface EmployeeInputs {
  employeeId: string;
  unitId: string;
  campusId: string;
  salaryForm: 'COEFFICIENT' | 'FIXED' | null;
  inputs: Record<string, string>;
  campusSplit: Record<string, string> | null;
  timesheetClosed: boolean;
  warnings: string[];
}

const PARAMS: [string, PolicyParameterCode][] = [
  ['BASE_SALARY', 'BASE_SALARY'],
  ['STD_DAYS', 'STANDARD_WORK_DAYS'],
  ['INS_CAP', 'INSURANCE_CAP_MULTIPLIER'],
  ['BHXH_RATE', 'BHXH_EMPLOYEE_RATE'],
  ['BHYT_RATE', 'BHYT_EMPLOYEE_RATE'],
  ['BHTN_RATE', 'BHTN_EMPLOYEE_RATE'],
  ['BHXH_ER_RATE', 'BHXH_EMPLOYER_RATE'],
  ['BHYT_ER_RATE', 'BHYT_EMPLOYER_RATE'],
  ['BHTN_ER_RATE', 'BHTN_EMPLOYER_RATE'],
  ['UNION_ER_RATE', 'UNION_FEE_EMPLOYER_RATE'],
  ['UNION_RATE', 'UNION_FEE_EMPLOYEE_RATE'],
  ['PIT_SELF', 'PIT_SELF_DEDUCTION'],
  ['PIT_DEPENDANT', 'PIT_DEPENDANT_DEDUCTION'],
];

/**
 * Thu thập biến đầu vào công thức lương của nhiều nhân viên cho một tháng (nạp theo lô).
 * Quy ước (⚠ TCKT xác nhận): thông tin lương / phụ cấp / hệ số lấy bản ghi có hiệu lực tại NGÀY ĐẦU THÁNG
 * — quyết định có hiệu lực giữa tháng áp dụng từ tháng sau.
 */
@Injectable()
export class PayrollInputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly shifts: ShiftsService,
  ) {}

  async params(month: string) {
    const first = dateColumn(monthRange(month).from);
    const out: Record<string, string> = {};
    const warnings: string[] = [];
    for (const [name, code] of PARAMS) {
      try {
        out[name] = (await this.policy.valueAt(code, first)).toString();
      } catch {
        out[name] = '0';
        warnings.push(`Chưa khai báo tham số ${code}`);
      }
    }
    return { values: out, warnings };
  }

  async pitBrackets(month: string) {
    const rows = await this.prisma.pitBracketVersion.findMany();
    const v = pickEffective(rows.map((r) => ({ effectiveFrom: ymdOf(r.effectiveFrom), value: JSON.stringify(r.brackets) })), monthRange(month).from);
    return v ? (JSON.parse(v.value) as { upTo: string | null; rate: string }[]) : [];
  }

  async gather(employeeIds: string[], month: string): Promise<Map<string, EmployeeInputs>> {
    const { from, to } = monthRange(month);
    const F = dateColumn(from);
    const L = dateColumn(to);
    const params = await this.params(month);

    const [employees, allowanceTypes, salaries, allowances, coefs, monthly, daily, unpaidTypes, extra, retro, dependants] = await Promise.all([
      this.prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, unitId: true, campusId: true } }),
      this.prisma.catalogItem.findMany({ where: { type: 'ALLOWANCE_TYPE' }, select: { code: true } }),
      this.prisma.employeeSalary.findMany({ where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: F } }, orderBy: { effectiveFrom: 'desc' } }),
      this.prisma.employeeAllowance.findMany({
        where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: F }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: F } }] },
      }),
      this.prisma.employeeIncomeCoefficient.findMany({ where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: F } }, orderBy: { effectiveFrom: 'desc' } }),
      this.prisma.monthlyTimesheet.findMany({ where: { employeeId: { in: employeeIds }, month } }),
      this.prisma.dailyTimesheet.findMany({
        where: { employeeId: { in: employeeIds }, date: { gte: F, lte: L } },
        include: { shift: { select: { type: true, workUnits: true } } },
      }),
      this.prisma.leaveType.findMany({ where: { paid: false }, select: { symbol: true } }),
      this.prisma.extraIncomeLine.findMany({ where: { employeeId: { in: employeeIds }, proposal: { status: 'APPROVED', month } } }),
      this.prisma.retroPay.findMany({ where: { employeeId: { in: employeeIds }, status: 'PENDING' } }),
      this.prisma.employeeFamilyMember.findMany({
        where: {
          employeeId: { in: employeeIds },
          isDependant: true,
          AND: [{ OR: [{ deductionFrom: null }, { deductionFrom: { lte: L } }] }, { OR: [{ deductionTo: null }, { deductionTo: { gte: F } }] }],
        },
        select: { employeeId: true },
      }),
    ]);
    const rateAt = await this.shifts.rateResolver();
    const unpaidSymbols = new Set(unpaidTypes.map((t) => t.symbol));

    const out = new Map<string, EmployeeInputs>();
    for (const e of employees) {
      const warnings = [...params.warnings];
      const sal = salaries.find((s) => s.employeeId === e.id);
      const coef = coefs.find((c) => c.employeeId === e.id);
      if (!sal) warnings.push('Chưa có diễn biến lương hiệu lực tại kỳ lương');

      const inputs: Record<string, string> = { ...params.values };
      inputs.IS_COEF = sal?.salaryForm === 'COEFFICIENT' ? '1' : '0';
      inputs.IS_FIXED = sal?.salaryForm === 'FIXED' ? '1' : '0';
      inputs.COEF = sal?.coefficient?.toString() ?? '0';
      inputs.BEYOND_PCT = sal?.beyondScalePercent?.toString() ?? '0';
      inputs.FIXED_AMOUNT = sal?.fixedAmount?.toString() ?? '0';
      inputs.STAB_COEF = coef?.stabilizationCoef.toString() ?? '0';
      inputs.MGMT_COEF = coef?.managementCoef.toString() ?? '0';
      inputs.OTHER_COEF = coef?.otherCoef.toString() ?? '0';
      for (const t of allowanceTypes) inputs[allowanceVar(t.code)] = '0';
      for (const a of allowances.filter((x) => x.employeeId === e.id)) {
        const k = allowanceVar(a.allowanceTypeCode);
        inputs[k] = new Money(inputs[k] ?? 0).plus(a.value.toString()).toString();
      }

      // Công tháng: ưu tiên số liệu đã chốt
      const snap = monthly.find((m) => m.employeeId === e.id);
      const rows = daily.filter((d) => d.employeeId === e.id);
      const totals: MonthTotals = snap
        ? (snap.totals as unknown as MonthTotals)
        : aggregateMonth(
            rows.map((r) => ({
              ...effective(r),
              status: r.status,
              isLate: r.isLate,
              isEarly: r.isEarly,
              lateMinutes: r.lateMinutes,
              earlyMinutes: r.earlyMinutes,
              campusId: r.campusId,
              expectedCampusId: r.expectedCampusId,
              shiftType: r.shift?.type ?? null,
            })),
          );
      if (!snap) warnings.push('Công tháng chưa chốt — số liệu có thể thay đổi');
      let unpaid = new Money(0);
      for (const [sym, n] of Object.entries(totals.bySymbol)) {
        if (unpaidSymbols.has(sym)) unpaid = unpaid.plus(n);
        else if (sym.includes('/') && unpaidSymbols.has(sym.split('/').pop()!)) unpaid = unpaid.plus(new Money(n).div(2));
      }
      inputs.WORK_UNITS = totals.workUnits;
      inputs.ABSENT_DAYS = String(totals.absentCount);
      inputs.UNPAID_DAYS = unpaid.toString();
      inputs.DUTY_COUNT = String(totals.dutyCount);

      let duty = new Money(0);
      for (const r of rows.filter((x) => x.shift?.type === 'DUTY')) {
        const units = new Money(effective(r).workUnits);
        const rate = rateAt(r.shiftId!, ymdOf(r.date));
        if (units.gt(0) && rate) duty = duty.plus(new Money(rate).times(units).div(r.shift!.workUnits.toString()));
      }
      inputs.DUTY_PAY = duty.toDecimalPlaces(0, Money.ROUND_HALF_UP).toString();

      inputs.EXTRA_INCOME = extra.filter((x) => x.employeeId === e.id).reduce((s, x) => s.plus(x.amount.toString()), new Money(0)).toString();
      const myRetro = retro.filter((x) => x.employeeId === e.id);
      inputs.RETRO_AMOUNT = myRetro.reduce((s, x) => s.plus(x.amount.toString()), new Money(0)).toString();
      inputs.RETRO_INS = myRetro.reduce((s, x) => s.plus(x.insAmount.toString()), new Money(0)).toString();
      inputs.DEPENDANTS = String(dependants.filter((d) => d.employeeId === e.id).length);

      out.set(e.id, {
        employeeId: e.id,
        unitId: e.unitId,
        campusId: e.campusId,
        salaryForm: (sal?.salaryForm as EmployeeInputs['salaryForm']) ?? null,
        inputs,
        campusSplit: Object.keys(totals.unitsByCampus).length ? totals.unitsByCampus : null,
        timesheetClosed: !!snap,
        warnings,
      });
    }
    return out;
  }
}
