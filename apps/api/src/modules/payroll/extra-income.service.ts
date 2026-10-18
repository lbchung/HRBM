import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@bachmai/db';
import { Money, type CreateExtraIncomeInput, type ListExtraIncomeQuery } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { ExcelService } from '../../common/excel/excel.service';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalsService, APPROVAL_COMPLETED_EVENT, type ApprovalCompletedEvent } from '../approvals/approvals.service';
import { TimesheetService } from '../attendance/timesheet.service';
import { AuditService } from '../audit/audit.service';

export const EXTRA_INCOME_WORKFLOW = 'EXTRA_INCOME_DEFAULT';
const fmtMonth = (m: string) => m.split('-').reverse().join('/');
const fmtMoney = (v: InstanceType<typeof Money>) => v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Thu nhập tăng thêm: khoa lập đề xuất → Phòng TCKT duyệt (quy trình duyệt) → chi trong kỳ lương tháng */
@Injectable()
export class ExtraIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly timesheet: TimesheetService,
    private readonly excel: ExcelService,
  ) {}

  async create(actor: AuthUser, input: CreateExtraIncomeInput, meta: RequestMeta) {
    const unit = await this.timesheet.assertUnitInScope(actor, input.unitId);
    const ids = input.lines.map((l) => l.employeeId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Một nhân viên chỉ xuất hiện một lần trong đề xuất');
    const emps = await this.prisma.employee.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    if (emps.length !== ids.length) throw new BadRequestException('Có nhân viên không tồn tại');
    if (input.lines.some((l) => new Money(l.amount).lte(0))) throw new BadRequestException('Số tiền phải lớn hơn 0');
    const closed = await this.prisma.payrollRun.findFirst({ where: { month: input.month, status: 'CLOSED' } });
    if (closed) throw new BadRequestException(`Bảng lương tháng ${fmtMonth(input.month)} đã chốt — chọn tháng chi khác`);
    const total = input.lines.reduce((s, l) => s.plus(l.amount), new Money(0));

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const code = await this.nextCode(tx, input.month);
          const p = await tx.extraIncomeProposal.create({
            data: {
              code,
              unitId: unit.id,
              month: input.month,
              title: input.title,
              note: input.note,
              total: total.toFixed(2),
              createdBy: actor.id,
              lines: { create: input.lines.map((l) => ({ employeeId: l.employeeId, amount: l.amount, note: l.note })) },
            },
          });
          const req = await this.approvals.submit(
            actor,
            {
              workflowCode: EXTRA_INCOME_WORKFLOW,
              targetType: 'EXTRA_INCOME',
              targetId: p.id,
              title: `Thu nhập tăng thêm ${fmtMonth(input.month)} — ${unit.name}`,
              content: `${input.title}\nSố người: ${input.lines.length}\nTổng tiền: ${fmtMoney(total)} đ`,
              unitId: unit.id,
              campusId: unit.campusId,
            },
            meta,
            tx,
          );
          const saved = await tx.extraIncomeProposal.update({ where: { id: p.id }, data: { approvalRequestId: req.id } });
          await this.audit.log({ actor, action: 'CREATE', entity: 'extra_income', entityId: p.id, after: { ...saved, lines: input.lines.length }, meta }, tx);
          return saved;
        });
      } catch (e) {
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  private async nextCode(tx: Prisma.TransactionClient, month: string) {
    const prefix = `TT-${month.replace('-', '')}-`;
    const last = await tx.extraIncomeProposal.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } });
    return `${prefix}${String(last ? Number(last.code.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
  }

  /** Đọc file Excel (Mã NV, Số tiền, Ghi chú) → dòng đề xuất, kiểm tra nhân viên thuộc đơn vị */
  async parseLines(actor: AuthUser, unitId: string, buffer: Buffer) {
    await this.timesheet.assertUnitInScope(actor, unitId);
    const { rows } = await this.excel.parse(buffer);
    const codes = rows.map((r) => String(r.values['Mã NV'] ?? '').trim().toUpperCase()).filter(Boolean);
    const emps = await this.prisma.employee.findMany({ where: { code: { in: codes }, deletedAt: null }, select: { id: true, code: true, fullName: true, unitId: true } });
    const lines: { employeeId: string; code: string; fullName: string; amount: string; note: string | null }[] = [];
    const errors: { row: number; message: string }[] = [];
    for (const r of rows) {
      const code = String(r.values['Mã NV'] ?? '').trim().toUpperCase();
      if (!code) continue;
      const e = emps.find((x) => x.code === code);
      const raw = String(r.values['Số tiền'] ?? '').replace(/[.,\s]/g, '');
      if (!e) errors.push({ row: r.rowNumber, message: `Không tìm thấy mã NV ${code}` });
      else if (e.unitId !== unitId) errors.push({ row: r.rowNumber, message: `${code} không thuộc đơn vị` });
      else if (!/^\d+$/.test(raw) || raw === '0') errors.push({ row: r.rowNumber, message: `${code}: số tiền không hợp lệ` });
      else if (lines.some((l) => l.employeeId === e.id)) errors.push({ row: r.rowNumber, message: `${code} bị trùng` });
      else lines.push({ employeeId: e.id, code, fullName: e.fullName, amount: raw, note: r.values['Ghi chú'] ? String(r.values['Ghi chú']) : null });
    }
    return { lines, errors };
  }

  template() {
    return this.excel.build([
      {
        name: 'Thu nhập tăng thêm',
        rows: [{ code: 'NV0001', amount: 1500000, note: '' }],
        columns: [
          { header: 'Mã NV', width: 14, value: (r: { code: string }) => r.code },
          { header: 'Số tiền', width: 16, value: (r: { amount: number }) => r.amount, numFmt: '#,##0' },
          { header: 'Ghi chú', width: 40, value: (r: { note: string }) => r.note },
        ],
      },
    ]);
  }

  private async where(actor: AuthUser, q: ListExtraIncomeQuery): Promise<Prisma.ExtraIncomeProposalWhereInput> {
    const units = await this.prisma.unit.findMany({ where: this.timesheet.unitScope(actor), select: { id: true } });
    const ids = units.map((u) => u.id);
    return { month: q.month, status: q.status, unitId: q.unitId ? (ids.includes(q.unitId) ? q.unitId : { in: [] }) : { in: ids } };
  }

  async list(actor: AuthUser, q: ListExtraIncomeQuery) {
    const where = await this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.extraIncomeProposal.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
      }),
      this.prisma.extraIncomeProposal.count({ where }),
    ]);
    const units = await this.prisma.unit.findMany({ where: { id: { in: [...new Set(items.map((i) => i.unitId))] } }, select: { id: true, name: true } });
    return paginated(
      items.map((i) => ({ ...i, unitName: units.find((u) => u.id === i.unitId)?.name ?? '', lineCount: i._count.lines })),
      total,
      q,
    );
  }

  async get(actor: AuthUser, id: string) {
    const p = await this.prisma.extraIncomeProposal.findUnique({
      where: { id },
      include: { lines: { include: { employee: { select: { id: true, code: true, fullName: true } } }, orderBy: { employee: { code: 'asc' } } } },
    });
    if (!p) throw new NotFoundException('Không tìm thấy đề xuất');
    const inScope = await this.prisma.unit.findFirst({ where: { id: p.unitId, ...this.timesheet.unitScope(actor) } });
    const isAssignee =
      p.approvalRequestId && (await this.prisma.approvalAssignee.findFirst({ where: { requestId: p.approvalRequestId, userId: actor.id } }));
    if (!inScope && !isAssignee) throw new ForbiddenException('Đề xuất ngoài phạm vi của bạn');
    const unit = await this.prisma.unit.findUnique({ where: { id: p.unitId }, select: { name: true } });
    return { ...p, unitName: unit?.name ?? '' };
  }

  async cancel(actor: AuthUser, id: string, meta: RequestMeta) {
    const p = await this.prisma.extraIncomeProposal.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy đề xuất');
    if (p.status === 'PENDING') {
      if (!p.approvalRequestId) throw new BadRequestException('Đề xuất không có quy trình duyệt');
      await this.approvals.cancel(actor, p.approvalRequestId, meta);
      return this.prisma.extraIncomeProposal.findUnique({ where: { id } });
    }
    if (p.status !== 'APPROVED') throw new BadRequestException('Đề xuất đã kết thúc');
    if (!actor.permissions.has('payroll.extra_income.approve')) throw new ForbiddenException('Chỉ Phòng TCKT hủy được đề xuất đã duyệt');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.extraIncomeProposal.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.log({ actor, action: 'CANCEL', entity: 'extra_income', entityId: id, before: p, meta }, tx);
      return r;
    });
  }

  @OnEvent(APPROVAL_COMPLETED_EVENT, { async: true })
  async onApprovalCompleted(e: ApprovalCompletedEvent) {
    if (e.targetType !== 'EXTRA_INCOME') return;
    const p = await this.prisma.extraIncomeProposal.findUnique({ where: { id: e.targetId } });
    if (!p || p.status !== 'PENDING') return;
    await this.prisma.extraIncomeProposal.update({ where: { id: p.id }, data: { status: e.status } });
  }
}
