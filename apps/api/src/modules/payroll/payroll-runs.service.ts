import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  Money,
  computePayslip,
  dateColumn,
  monthRange,
  normalizeSearch,
  type CreateRunInput,
  type ListRunItemsQuery,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../audit/audit.service';
import { PayrollConfigService, toComponentDef } from './payroll-config.service';
import { PayrollInputsService } from './payroll-inputs.service';

export const QUEUE_PAYROLL = 'payroll';
const CHUNK = 200;

@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly inputs: PayrollInputsService,
    private readonly config: PayrollConfigService,
  ) {}

  list() {
    return this.prisma.payrollRun.findMany({ orderBy: [{ month: 'desc' }, { createdAt: 'desc' }], take: 60 });
  }

  async get(id: string) {
    const r = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Không tìm thấy kỳ lương');
    return r;
  }

  async create(actor: AuthUser, input: CreateRunInput, meta: RequestMeta) {
    const open = await this.prisma.payrollRun.findFirst({ where: { month: input.month, status: { not: 'CLOSED' } } });
    if (open) throw new BadRequestException(`Tháng ${input.month} đang có kỳ lương chưa chốt (${open.code})`);
    const count = await this.prisma.payrollRun.count({ where: { month: input.month } });
    const code = `BL-${input.month}${count ? `-${count + 1}` : ''}`;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.payrollRun.create({ data: { ...input, code, createdBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'payroll_run', entityId: r.id, after: r, meta }, tx);
      return r;
    });
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.get(id);
    if (r.status === 'CLOSED') throw new BadRequestException('Không xóa được kỳ lương đã chốt');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'payroll_run', entityId: id, before: r, meta }, tx);
    });
  }

  async enqueueCalculate(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.get(id);
    if (r.status === 'CLOSED') throw new BadRequestException('Kỳ lương đã chốt');
    if (r.status === 'CALCULATING') throw new BadRequestException('Kỳ lương đang được tính');
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'CALCULATING', progress: 0 } });
    await this.queue.add(QUEUE_PAYROLL, 'calculate', { runId: id }, { jobId: `calc-${id}-${Date.now()}` });
    await this.audit.log({ actor, action: 'CALCULATE', entity: 'payroll_run', entityId: id, meta });
    return { ok: true };
  }

  /** Tính lương cả kỳ — chạy trong job nền, chia lô CHUNK nhân viên */
  async calculate(runId: string) {
    const run = await this.get(runId);
    const { from, to } = monthRange(run.month);
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        OR: [{ startDate: null }, { startDate: { lte: dateColumn(to) } }],
        AND: [{ OR: [{ status: { in: ACTIVE_EMPLOYEE_STATUSES } }, { leaveDate: { gte: dateColumn(from) } }] }],
      },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    const components = (await this.config.components(false)).map(toComponentDef);
    const brackets = await this.inputs.pitBrackets(run.month);
    await this.prisma.payrollItem.deleteMany({ where: { runId } });
    await this.prisma.payrollRun.update({ where: { id: runId }, data: { employeeCount: employees.length } });

    const totals = { gross: new Money(0), deductions: new Money(0), net: new Money(0), employerCost: new Money(0) };
    let errorCount = 0;
    for (let i = 0; i < employees.length; i += CHUNK) {
      const ids = employees.slice(i, i + CHUNK).map((e) => e.id);
      const inputs = await this.inputs.gather(ids, run.month);
      const items: Prisma.PayrollItemCreateManyInput[] = [];
      const lines: Prisma.PayrollLineCreateManyInput[] = [];
      for (const inp of inputs.values()) {
        const r = computePayslip(components, inp.inputs, brackets);
        const itemId = randomUUID();
        const errors = [...r.errors.map((x) => `${x.code}: ${x.message}`), ...inp.warnings];
        if (r.errors.length || !inp.salaryForm) errorCount++;
        items.push({
          id: itemId,
          runId,
          employeeId: inp.employeeId,
          unitId: inp.unitId,
          campusId: inp.campusId,
          salaryForm: inp.salaryForm,
          inputs: inp.inputs,
          campusSplit: inp.campusSplit ?? undefined,
          gross: r.gross,
          taxable: r.taxable,
          deductions: r.deductions,
          employerCost: r.employerCost,
          net: r.net,
          errors: errors.length ? errors : undefined,
          timesheetClosed: inp.timesheetClosed,
        });
        r.lines.forEach((l, idx) => lines.push({ itemId, code: l.code, name: l.name, kind: l.kind, taxable: l.taxable, amount: l.amount, sortOrder: idx }));
        totals.gross = totals.gross.plus(r.gross);
        totals.deductions = totals.deductions.plus(r.deductions);
        totals.net = totals.net.plus(r.net);
        totals.employerCost = totals.employerCost.plus(r.employerCost);
      }
      await this.prisma.$transaction([this.prisma.payrollItem.createMany({ data: items }), this.prisma.payrollLine.createMany({ data: lines })]);
      await this.prisma.payrollRun.update({ where: { id: runId }, data: { progress: Math.min(employees.length, i + CHUNK) } });
    }
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'CALCULATED',
        calculatedAt: new Date(),
        errorCount,
        totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toString()])),
      },
    });
    return { employees: employees.length, errorCount };
  }

  async items(id: string, q: ListRunItemsQuery) {
    const search = normalizeSearch(q.search);
    const where: Prisma.PayrollItemWhereInput = {
      runId: id,
      unitId: q.unitId,
      campusId: q.campusId,
      ...(q.hasErrors ? { NOT: { errors: { equals: null as unknown as Prisma.InputJsonValue } } } : {}),
      ...(search ? { employee: { searchText: { contains: search } } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payrollItem.findMany({
        where,
        include: { employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } } },
        orderBy: { employee: { code: 'asc' } },
        ...toSkipTake(q),
      }),
      this.prisma.payrollItem.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async item(actor: AuthUser, itemId: string) {
    const item = await this.prisma.payrollItem.findUnique({
      where: { id: itemId },
      include: {
        run: true,
        lines: { orderBy: { sortOrder: 'asc' } },
        employee: { select: { id: true, code: true, fullName: true, userId: true, unit: { select: { name: true } }, campus: { select: { name: true } } } },
      },
    });
    if (!item) throw new NotFoundException('Không tìm thấy phiếu lương');
    const isSelf = item.employee.userId === actor.id;
    if (!actor.permissions.has('payroll.read') && !(isSelf && item.run.status === 'CLOSED' && actor.permissions.has('self.payslip.read'))) {
      throw new ForbiddenException('Bạn không có quyền xem phiếu lương này');
    }
    const comps = await this.prisma.salaryComponent.findMany({ select: { code: true, showOnPayslip: true } });
    const hidden = new Set(comps.filter((c) => !c.showOnPayslip).map((c) => c.code));
    return {
      ...item,
      lines: item.lines.map((l) => ({ ...l, id: l.id.toString(), hidden: hidden.has(l.code) })),
    };
  }

  /** Phiếu lương của tôi (chỉ kỳ đã chốt) */
  async myPayslips(actor: AuthUser) {
    const emp = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, select: { id: true } });
    if (!emp) return [];
    return this.prisma.payrollItem.findMany({
      where: { employeeId: emp.id, run: { status: 'CLOSED' } },
      select: { id: true, gross: true, deductions: true, net: true, run: { select: { code: true, month: true, name: true, closedAt: true } } },
      orderBy: { run: { month: 'desc' } },
    });
  }

  /** Chốt kỳ lương: khóa + đánh dấu thu nhập tăng thêm / truy lĩnh đã chi */
  async close(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.get(id);
    if (r.status !== 'CALCULATED') throw new BadRequestException('Chỉ chốt được kỳ lương đã tính xong');
    const calcAt = r.calculatedAt!;
    const changed = await this.prisma.$transaction([
      this.prisma.extraIncomeProposal.count({ where: { month: r.month, status: 'APPROVED', updatedAt: { gt: calcAt } } }),
      this.prisma.retroPay.count({ where: { status: 'PENDING', updatedAt: { gt: calcAt } } }),
    ]);
    if (changed[0] || changed[1]) {
      throw new BadRequestException('Có thu nhập tăng thêm / truy lĩnh mới phát sinh sau lần tính gần nhất — hãy tính lại trước khi chốt');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.extraIncomeProposal.updateMany({ where: { month: r.month, status: 'APPROVED' }, data: { status: 'PAID', paidRunId: id } });
      const empIds = (await tx.payrollItem.findMany({ where: { runId: id }, select: { employeeId: true } })).map((x) => x.employeeId);
      await tx.retroPay.updateMany({ where: { status: 'PENDING', employeeId: { in: empIds } }, data: { status: 'INCLUDED', includedRunId: id } });
      await tx.payrollRun.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedBy: actor.id } });
      await this.audit.log({ actor, action: 'CLOSE', entity: 'payroll_run', entityId: id, after: r.totals, meta }, tx);
    });
    return this.get(id);
  }

  /** Tổng hợp theo đơn vị và theo cơ sở (phân bổ theo số công thực tế tại từng cơ sở) */
  async summary(id: string) {
    const items = await this.prisma.payrollItem.findMany({
      where: { runId: id },
      select: { unitId: true, campusId: true, campusSplit: true, gross: true, deductions: true, net: true, employerCost: true },
    });
    const [units, campuses] = await Promise.all([
      this.prisma.unit.findMany({ select: { id: true, name: true } }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
    ]);
    const zero = () => ({ count: 0, gross: new Money(0), deductions: new Money(0), net: new Money(0), employerCost: new Money(0) });
    const byUnit = new Map<string, ReturnType<typeof zero>>();
    const byCampus = new Map<string, ReturnType<typeof zero>>();
    for (const it of items) {
      const u = byUnit.get(it.unitId) ?? zero();
      u.count++;
      u.gross = u.gross.plus(it.gross.toString());
      u.deductions = u.deductions.plus(it.deductions.toString());
      u.net = u.net.plus(it.net.toString());
      u.employerCost = u.employerCost.plus(it.employerCost.toString());
      byUnit.set(it.unitId, u);

      const split = (it.campusSplit as Record<string, string> | null) ?? { [it.campusId]: '1' };
      const totalUnits = Object.values(split).reduce((s, v) => s.plus(v), new Money(0));
      for (const [campusId, units] of Object.entries(split)) {
        const share = totalUnits.gt(0) ? new Money(units).div(totalUnits) : new Money(1);
        const c = byCampus.get(campusId) ?? zero();
        c.count += share.toNumber();
        c.gross = c.gross.plus(share.times(it.gross.toString()));
        c.deductions = c.deductions.plus(share.times(it.deductions.toString()));
        c.net = c.net.plus(share.times(it.net.toString()));
        c.employerCost = c.employerCost.plus(share.times(it.employerCost.toString()));
        byCampus.set(campusId, c);
      }
    }
    const fmt = (m: Map<string, ReturnType<typeof zero>>, names: { id: string; name: string }[]) =>
      [...m.entries()].map(([key, v]) => ({
        id: key,
        name: names.find((n) => n.id === key)?.name ?? key,
        count: Math.round(v.count * 100) / 100,
        gross: v.gross.toFixed(0),
        deductions: v.deductions.toFixed(0),
        net: v.net.toFixed(0),
        employerCost: v.employerCost.toFixed(0),
      }));
    return { byUnit: fmt(byUnit, units).sort((a, b) => a.name.localeCompare(b.name)), byCampus: fmt(byCampus, campuses) };
  }

  /** Dữ liệu xuất Excel bảng lương: mỗi dòng một nhân viên, mỗi cột một khoản */
  async exportRows(id: string) {
    const [run, items, comps] = await Promise.all([
      this.get(id),
      this.prisma.payrollItem.findMany({
        where: { runId: id },
        include: {
          lines: true,
          employee: { select: { code: true, fullName: true, bankAccountEnc: true, bankCode: true, bankBranch: true, unit: { select: { name: true } } } },
        },
        orderBy: { employee: { code: 'asc' } },
      }),
      this.prisma.salaryComponent.findMany({ where: { isActive: true, kind: { in: ['EARNING', 'DEDUCTION'] } }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return { run, items, comps };
  }
}
