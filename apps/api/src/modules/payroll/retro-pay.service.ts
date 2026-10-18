import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Money, pickSalaryVars, retroMonthDiff, type ComponentDef } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SALARY_CHANGED_EVENT, type SalaryChangedEvent } from '../hr/sub-records.service';
import { PayrollConfigService, toComponentDef } from './payroll-config.service';
import { PayrollInputsService } from './payroll-inputs.service';

export interface RetroMonthDetail {
  month: string;
  runCode: string;
  /** Biến lương đã chi (sau các lần truy lĩnh trước) và biến lương mới */
  paidVars: Record<string, string>;
  newVars: Record<string, string>;
  oldGross: string;
  newGross: string;
  amount: string;
  insAmount: string;
}

/**
 * TRUY LĨNH — khi lương / phụ cấp / hệ số thay đổi có hiệu lực hồi tố vào các kỳ đã chốt:
 *  - Mỗi kỳ đã chốt: tính lại phiếu với tham số chính sách ĐÃ LƯU của kỳ đó (lương cơ sở, tỷ lệ BH…),
 *    chỉ thay biến lương theo hồ sơ mới. Chênh lệch tổng thu nhập = tiền truy lĩnh; chênh lệch BH người lao động = truy thu BH.
 *  - "Đã chi" của một kỳ = biến lương lưu trong phiếu, hoặc biến mới của lần truy lĩnh đã chi gần nhất cho kỳ đó.
 *  - Một nhân viên có tối đa một bản truy lĩnh chờ chi; phát sinh mới thì tính lại toàn bộ.
 */
@Injectable()
export class RetroPayService {
  private readonly logger = new Logger(RetroPayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inputs: PayrollInputsService,
    private readonly config: PayrollConfigService,
  ) {}

  @OnEvent(SALARY_CHANGED_EVENT, { async: true })
  async onSalaryChanged(e: SalaryChangedEvent) {
    try {
      await this.recompute(e.employeeId, e.fromDate.slice(0, 7), e.reason);
    } catch (err) {
      this.logger.error(`Tính truy lĩnh lỗi cho ${e.employeeId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  async recompute(employeeId: string, fromMonth: string, reason: string) {
    const pending = await this.prisma.retroPay.findFirst({ where: { employeeId, status: 'PENDING' } });
    const start = pending && pending.fromMonth < fromMonth ? pending.fromMonth : fromMonth;
    const items = await this.prisma.payrollItem.findMany({
      where: { employeeId, run: { status: 'CLOSED', month: { gte: start } } },
      include: { run: { select: { month: true, code: true } } },
      orderBy: { run: { closedAt: 'asc' } },
    });
    // Mỗi tháng lấy phiếu của kỳ chốt sau cùng (kỳ lương bổ sung ghi đè)
    const byMonth = new Map(items.map((i) => [i.run.month, i]));
    const included = await this.prisma.retroPay.findMany({ where: { employeeId, status: 'INCLUDED' }, orderBy: { createdAt: 'asc' } });
    const paidOverride = new Map<string, Record<string, string>>();
    for (const r of included) for (const d of r.details as unknown as RetroMonthDetail[]) paidOverride.set(d.month, d.newVars);

    const comps: ComponentDef[] = (await this.config.components(false)).map(toComponentDef);
    const details: RetroMonthDetail[] = [];
    let amount = new Money(0);
    let insAmount = new Money(0);
    for (const [month, item] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const stored = item.inputs as Record<string, string>;
      const fresh = (await this.inputs.gather([employeeId], month)).get(employeeId);
      if (!fresh) continue;
      const paidVars = paidOverride.get(month) ?? pickSalaryVars(stored);
      const newVars = pickSalaryVars(fresh.inputs);
      const d = retroMonthDiff(comps, stored, paidVars, newVars, await this.inputs.pitBrackets(month));
      if (d.amount === '0' && d.insAmount === '0') continue;
      details.push({ month, runCode: item.run.code, paidVars, newVars, ...d });
      amount = amount.plus(d.amount);
      insAmount = insAmount.plus(d.insAmount);
    }

    if (!details.length) {
      if (pending) await this.prisma.retroPay.update({ where: { id: pending.id }, data: { status: 'CANCELLED', reason: `${pending.reason} — hết chênh lệch` } });
      return null;
    }
    const data = {
      reason: pending ? (pending.reason.includes(reason) ? pending.reason : `${pending.reason}; ${reason}`).slice(0, 500) : reason,
      fromMonth: details[0].month,
      toMonth: details[details.length - 1].month,
      amount: amount.toFixed(0),
      insAmount: insAmount.toFixed(0),
      details: details as unknown as object,
    };
    return pending
      ? this.prisma.retroPay.update({ where: { id: pending.id }, data })
      : this.prisma.retroPay.create({ data: { ...data, employeeId } });
  }

  list(status?: 'PENDING' | 'INCLUDED' | 'CANCELLED') {
    return this.prisma.retroPay.findMany({
      where: { status },
      include: { employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });
  }

  async get(id: string) {
    const r = await this.prisma.retroPay.findUnique({
      where: { id },
      include: { employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } } },
    });
    if (!r) throw new NotFoundException('Không tìm thấy bản truy lĩnh');
    return r;
  }

  /** Tính lại thủ công (VD sau khi sửa công thức) */
  async manualRecompute(actor: AuthUser, employeeId: string, fromMonth: string, meta: RequestMeta) {
    const r = await this.recompute(employeeId, fromMonth, 'Tính lại thủ công');
    await this.audit.log({ actor, action: 'RECOMPUTE', entity: 'retro_pay', entityId: r?.id ?? employeeId, after: r, meta });
    return r;
  }

  async cancel(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.get(id);
    if (r.status !== 'PENDING') throw new BadRequestException('Chỉ hủy được truy lĩnh đang chờ chi');
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.retroPay.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ actor, action: 'CANCEL', entity: 'retro_pay', entityId: id, before: r, meta }, tx);
      return saved;
    });
  }
}
