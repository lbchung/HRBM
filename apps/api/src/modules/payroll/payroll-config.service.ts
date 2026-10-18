import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SalaryComponent } from '@bachmai/db';
import {
  allowanceVar,
  computePayslip,
  evaluateFormula,
  PAYROLL_FUNCTIONS,
  PAYROLL_VARIABLES,
  validateFormula,
  ymdOf,
  type ComponentDef,
  type CreateComponentInput,
  type CreateScaleInput,
  type PitBracketsInput,
  type UpdateComponentInput,
  type UpdateScaleInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayrollInputsService } from './payroll-inputs.service';

export const toComponentDef = (c: SalaryComponent): ComponentDef => ({
  code: c.code,
  name: c.name,
  kind: c.kind,
  formula: c.formula,
  taxable: c.taxable,
  roundDigits: c.roundDigits,
  sortOrder: c.sortOrder,
});

@Injectable()
export class PayrollConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inputs: PayrollInputsService,
  ) {}

  // ================= KHOẢN LƯƠNG =================

  components(includeInactive = true) {
    return this.prisma.salaryComponent.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  /** Danh sách biến dùng được trong công thức (biến đầu vào + phụ cấp + mã các khoản) */
  async variables() {
    const [allowances, comps] = await Promise.all([
      this.prisma.catalogItem.findMany({ where: { type: 'ALLOWANCE_TYPE' }, select: { code: true, name: true } }),
      this.components(),
    ]);
    return {
      inputs: Object.entries(PAYROLL_VARIABLES).map(([name, description]) => ({ name, description })),
      allowances: allowances.map((a) => ({ name: allowanceVar(a.code), description: `Phụ cấp: ${a.name}` })),
      components: comps.map((c) => ({ name: c.code, description: c.name, sortOrder: c.sortOrder })),
      functions: ['min(a, b, …)', 'max(a, b, …)', 'round(x, chữ số)', 'floor(x)', 'ceil(x)', 'abs(x)', 'if(điều kiện, a, b)', ...PAYROLL_FUNCTIONS.map((f) => `${f}()`)],
    };
  }

  /** Công thức chỉ được dùng biến đầu vào, phụ cấp, và mã các khoản ĐỨNG TRƯỚC trong thứ tự tính */
  private async assertFormula(formula: string, code: string, sortOrder: number) {
    const [allowances, comps] = await Promise.all([
      this.prisma.catalogItem.findMany({ where: { type: 'ALLOWANCE_TYPE' }, select: { code: true } }),
      this.prisma.salaryComponent.findMany({ where: { sortOrder: { lt: sortOrder }, code: { not: code } }, select: { code: true } }),
    ]);
    const known = new Set<string>([
      ...Object.keys(PAYROLL_VARIABLES),
      ...allowances.map((a) => allowanceVar(a.code)),
      ...comps.map((c) => c.code),
    ]);
    const err = validateFormula(formula, known, [...PAYROLL_FUNCTIONS]);
    if (err) throw new BadRequestException({ message: `Công thức không hợp lệ: ${err}`, errors: { formula: [`${err} (chỉ dùng được khoản có thứ tự tính nhỏ hơn)`] } });
  }

  async createComponent(actor: AuthUser, input: CreateComponentInput, meta: RequestMeta) {
    await this.assertFormula(input.formula, input.code, input.sortOrder);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.salaryComponent.create({ data: { ...input, createdBy: actor.id, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'salary_component', entityId: c.id, after: c, meta }, tx);
      return c;
    });
  }

  async updateComponent(actor: AuthUser, id: string, input: UpdateComponentInput, meta: RequestMeta) {
    const before = await this.prisma.salaryComponent.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy khoản lương');
    await this.assertFormula(input.formula ?? before.formula, before.code, input.sortOrder ?? before.sortOrder);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.salaryComponent.update({ where: { id }, data: { ...input, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'salary_component', entityId: id, before, after: c, meta }, tx);
      return c;
    });
  }

  /** Kiểm tra cú pháp + biến của một công thức (mọi khoản), tính thử nếu có nhân viên & tháng */
  async testFormula(formula: string, employeeId?: string, month?: string) {
    const [allowances, comps] = await Promise.all([
      this.prisma.catalogItem.findMany({ where: { type: 'ALLOWANCE_TYPE' }, select: { code: true } }),
      this.prisma.salaryComponent.findMany({ select: { code: true } }),
    ]);
    const known = new Set<string>([...Object.keys(PAYROLL_VARIABLES), ...allowances.map((a) => allowanceVar(a.code)), ...comps.map((c) => c.code)]);
    const error = validateFormula(formula, known, [...PAYROLL_FUNCTIONS]);
    if (error || !employeeId || !month) return { valid: !error, error, result: null };
    const p = await this.preview(employeeId, month, formula);
    return { valid: !p.formulaError, error: p.formulaError, result: p.formulaResult };
  }

  /** Tính thử phiếu lương của một nhân viên cho một tháng (không lưu) */
  async preview(employeeId: string, month: string, formula?: string) {
    const map = await this.inputs.gather([employeeId], month);
    const inp = map.get(employeeId);
    if (!inp) throw new NotFoundException('Không tìm thấy nhân viên');
    const comps = (await this.components(false)).map(toComponentDef);
    const result = computePayslip(comps, inp.inputs, await this.inputs.pitBrackets(month));
    let formulaResult: string | null = null;
    let formulaError: string | null = null;
    if (formula) {
      try {
        const vars: Record<string, string> = { ...inp.inputs };
        for (const l of result.lines) vars[l.code] = l.amount;
        formulaResult = evaluateFormula(formula, vars).toString();
      } catch (e) {
        formulaError = e instanceof Error ? e.message : String(e);
      }
    }
    return { inputs: inp.inputs, warnings: inp.warnings, ...result, formulaResult, formulaError };
  }

  // ================= THANG LƯƠNG =================

  scales() {
    return this.prisma.salaryScale.findMany({ include: { steps: { orderBy: { step: 'asc' } } }, orderBy: { code: 'asc' } });
  }

  async createScale(actor: AuthUser, input: CreateScaleInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.salaryScale.create({
        data: {
          code: input.code,
          name: input.name,
          raiseIntervalMonths: input.raiseIntervalMonths,
          isActive: input.isActive ?? true,
          steps: { create: input.coefficients.map((coefficient, i) => ({ step: i + 1, coefficient })) },
        },
        include: { steps: true },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'salary_scale', entityId: s.id, after: s, meta }, tx);
      return s;
    });
  }

  async updateScale(actor: AuthUser, id: string, input: UpdateScaleInput, meta: RequestMeta) {
    const before = await this.prisma.salaryScale.findUnique({ where: { id }, include: { steps: true } });
    if (!before) throw new NotFoundException('Không tìm thấy thang lương');
    return this.prisma.$transaction(async (tx) => {
      if (input.coefficients) {
        await tx.salaryScaleStep.deleteMany({ where: { scaleId: id } });
        await tx.salaryScaleStep.createMany({ data: input.coefficients.map((coefficient, i) => ({ scaleId: id, step: i + 1, coefficient })) });
      }
      const s = await tx.salaryScale.update({
        where: { id },
        data: { name: input.name, raiseIntervalMonths: input.raiseIntervalMonths, isActive: input.isActive },
        include: { steps: { orderBy: { step: 'asc' } } },
      });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'salary_scale', entityId: id, before, after: s, meta }, tx);
      return s;
    });
  }

  /** Thang lương của một chức danh nghề nghiệp (meta.salaryScale của danh mục JOB_TITLE) */
  async scaleForJobTitle(jobTitleCode: string | null, tx: Prisma.TransactionClient = this.prisma) {
    if (!jobTitleCode) return null;
    const item = await tx.catalogItem.findUnique({ where: { type_code: { type: 'JOB_TITLE', code: jobTitleCode } } });
    const code = (item?.meta as Record<string, unknown> | null)?.salaryScale as string | undefined;
    if (!code) return null;
    return tx.salaryScale.findUnique({ where: { code }, include: { steps: { orderBy: { step: 'asc' } } } });
  }

  // ================= BIỂU THUẾ TNCN =================

  async pitVersions() {
    const rows = await this.prisma.pitBracketVersion.findMany({ orderBy: { effectiveFrom: 'desc' } });
    return rows.map((r) => ({ ...r, effectiveFrom: ymdOf(r.effectiveFrom) }));
  }

  async addPitVersion(actor: AuthUser, input: PitBracketsInput, meta: RequestMeta) {
    const uppers = input.brackets.map((b) => b.upTo).filter((x): x is string => x !== null).map(Number);
    if (uppers.some((v, i) => i > 0 && v <= uppers[i - 1])) throw new BadRequestException('Ngưỡng các bậc phải tăng dần');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.pitBracketVersion.create({
        data: { effectiveFrom: input.effectiveFrom, brackets: input.brackets, legalBasis: input.legalBasis, createdBy: actor.id },
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'pit_brackets', entityId: r.id, after: r, meta }, tx);
      return r;
    });
  }
}
