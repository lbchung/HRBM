import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  dateColumn,
  nextRaise,
  nextRaiseDateAfter,
  ymdOf,
  type CreateRaisesInput,
  type DecideRaisesInput,
  type ListRaisesQuery,
  type RaiseDueQuery,
  type SalaryScaleDef,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../hr/employees.service';
import { SALARY_CHANGED_EVENT, type SalaryChangedEvent } from '../hr/sub-records.service';

export const RAISE_KIND_LABELS = { REGULAR: 'Nâng bậc thường xuyên', EARLY: 'Nâng bậc trước hạn', BEYOND_SCALE: 'Thâm niên vượt khung' } as const;

@Injectable()
export class SalaryRaisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly events: EventEmitter2,
  ) {}

  /** Thang lương theo mã chức danh (danh mục JOB_TITLE, meta.salaryScale) */
  private async scaleMap() {
    const [titles, scales] = await Promise.all([
      this.prisma.catalogItem.findMany({ where: { type: 'JOB_TITLE' }, select: { code: true, meta: true } }),
      this.prisma.salaryScale.findMany({ where: { isActive: true }, include: { steps: { orderBy: { step: 'asc' } } } }),
    ]);
    const byCode = new Map<string, SalaryScaleDef>(
      scales.map((s) => [s.code, { code: s.code, raiseIntervalMonths: s.raiseIntervalMonths, coefficients: s.steps.map((x) => x.coefficient.toString()) }]),
    );
    const out = new Map<string, SalaryScaleDef>();
    for (const t of titles) {
      const sc = (t.meta as Record<string, unknown> | null)?.salaryScale;
      if (typeof sc === 'string' && byCode.has(sc)) out.set(t.code, byCode.get(sc)!);
    }
    return out;
  }

  /**
   * Danh sách đến hạn nâng lương trong khoảng [from, to] — chỉ nhân viên lương hệ số,
   * có chức danh gắn thang lương, chưa có đề xuất đang chờ.
   */
  async due(actor: AuthUser, q: RaiseDueQuery) {
    const scales = await this.scaleMap();
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ACTIVE_EMPLOYEE_STATUSES }, unitId: q.unitId, ...this.employees.scope(actor) },
      select: {
        id: true,
        code: true,
        fullName: true,
        unit: { select: { name: true } },
        salaries: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
        disciplines: { select: { effectiveFrom: true, delayRaiseMonths: true } },
        salaryRaises: { where: { status: 'PROPOSED' }, select: { id: true } },
      },
      orderBy: { code: 'asc' },
    });
    // Nghỉ không lương đã duyệt — cộng số ngày phát sinh từ mốc giữ bậc
    const unpaidRows = await this.prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', leaveType: { paid: false }, employeeId: { in: employees.map((e) => e.id) } },
      select: { employeeId: true, fromDate: true, days: true },
    });

    const out = [];
    for (const e of employees) {
      const sal = e.salaries[0];
      if (!sal || sal.salaryForm !== 'COEFFICIENT' || !sal.scaleCode || !sal.step || e.salaryRaises.length) continue;
      const scale = scales.get(sal.scaleCode);
      if (!scale) continue;
      const since = ymdOf(sal.effectiveFrom);
      const delay = e.disciplines.filter((d) => ymdOf(d.effectiveFrom) >= since).reduce((s, d) => s + d.delayRaiseMonths, 0);
      const unpaidDays = unpaidRows.filter((r) => r.employeeId === e.id && ymdOf(r.fromDate) >= since).reduce((s, r) => s + Number(r.days), 0);
      const p = nextRaise({
        scale,
        currentStep: sal.step,
        beyondScalePercent: Number(sal.beyondScalePercent ?? 0),
        since,
        nextRaiseDate: sal.nextRaiseDate ? ymdOf(sal.nextRaiseDate) : null,
        disciplineDelayMonths: delay,
        unpaidLeaveDays: unpaidDays,
      });
      if (!p || p.dueDate < ymdOf(q.from) || p.dueDate > ymdOf(q.to)) continue;
      out.push({
        employeeId: e.id,
        code: e.code,
        fullName: e.fullName,
        unitName: e.unit.name,
        scaleCode: sal.scaleCode,
        salaryScale: scale.code,
        fromStep: sal.step,
        fromCoefficient: sal.coefficient?.toString() ?? null,
        fromBeyondPct: sal.beyondScalePercent?.toString() ?? '0',
        since,
        kind: p.kind,
        toStep: p.toStep,
        toCoefficient: p.toCoefficient,
        toBeyondPct: String(p.toBeyondScalePercent),
        dueDate: p.dueDate,
        disciplineDelayMonths: delay,
        unpaidLeaveDays: unpaidDays,
      });
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.code.localeCompare(b.code));
  }

  /** Lập đề xuất nâng lương (từ danh sách đến hạn hoặc nâng trước hạn) */
  async create(actor: AuthUser, input: CreateRaisesInput, meta: RequestMeta) {
    const ids = [...new Set(input.items.map((i) => i.employeeId))];
    if (ids.length !== input.items.length) throw new BadRequestException('Mỗi nhân viên chỉ một đề xuất');
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: ids }, deletedAt: null, ...this.employees.scope(actor) },
      select: { id: true, fullName: true, salaries: { orderBy: { effectiveFrom: 'desc' }, take: 1 }, salaryRaises: { where: { status: 'PROPOSED' }, select: { id: true } } },
    });
    if (emps.length !== ids.length) throw new BadRequestException('Có nhân viên không tồn tại hoặc ngoài phạm vi quản lý');
    const busy = emps.filter((e) => e.salaryRaises.length).map((e) => e.fullName);
    if (busy.length) throw new BadRequestException(`Đã có đề xuất đang chờ duyệt: ${busy.slice(0, 5).join(', ')}`);
    const noSalary = emps.filter((e) => e.salaries[0]?.salaryForm !== 'COEFFICIENT').map((e) => e.fullName);
    if (noSalary.length) throw new BadRequestException(`Chưa có diễn biến lương hệ số: ${noSalary.slice(0, 5).join(', ')}`);

    return this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const it of input.items) {
        const sal = emps.find((e) => e.id === it.employeeId)!.salaries[0];
        const r = await tx.salaryRaise.create({
          data: {
            employeeId: it.employeeId,
            kind: it.kind,
            scaleCode: sal.scaleCode,
            fromStep: sal.step,
            toStep: it.toStep,
            fromCoefficient: sal.coefficient,
            toCoefficient: it.toCoefficient,
            fromBeyondPct: sal.beyondScalePercent,
            toBeyondPct: it.toBeyondPct,
            dueDate: it.dueDate,
            effectiveDate: it.effectiveDate,
            reason: it.reason,
            createdBy: actor.id,
          },
        });
        rows.push(r);
      }
      await this.audit.log({ actor, action: 'CREATE', entity: 'salary_raise', entityId: rows[0].id, after: { count: rows.length, ids: rows.map((r) => r.id) }, meta }, tx);
      return { created: rows.length };
    });
  }

  /** Duyệt / từ chối. Duyệt → tạo diễn biến lương mới có hiệu lực từ ngày quyết định, kích hoạt truy lĩnh nếu hồi tố */
  async decide(actor: AuthUser, input: DecideRaisesInput, meta: RequestMeta) {
    const raises = await this.prisma.salaryRaise.findMany({
      where: { id: { in: input.ids }, status: 'PROPOSED', employee: this.employees.scope(actor) },
      include: { employee: { select: { id: true, source: true } } },
    });
    if (raises.length !== input.ids.length) throw new BadRequestException('Có đề xuất không tồn tại, đã xử lý hoặc ngoài phạm vi');
    if (input.approve && !input.decisionNo) throw new BadRequestException({ message: 'Nhập số quyết định', errors: { decisionNo: ['Nhập số quyết định'] } });
    const scales = await this.scaleMap();
    const now = new Date();
    const changed: SalaryChangedEvent[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const r of raises) {
        let resultSalaryId: string | null = null;
        if (input.approve) {
          const scale = r.scaleCode ? scales.get(r.scaleCode) : undefined;
          const eff = ymdOf(r.effectiveDate);
          const exists = await tx.employeeSalary.findUnique({ where: { employeeId_effectiveFrom: { employeeId: r.employeeId, effectiveFrom: r.effectiveDate } } });
          if (exists) throw new BadRequestException(`Nhân viên đã có diễn biến lương ngày ${eff.split('-').reverse().join('/')}`);
          const sal = await tx.employeeSalary.create({
            data: {
              employeeId: r.employeeId,
              effectiveFrom: r.effectiveDate,
              salaryForm: 'COEFFICIENT',
              scaleCode: r.scaleCode,
              step: r.toStep,
              coefficient: r.toCoefficient,
              beyondScalePercent: r.toBeyondPct,
              // Nâng trước hạn: thời gian xét lần sau tính từ mốc đến hạn cũ (⚠ TCCB xác nhận)
              nextRaiseDate: scale
                ? dateColumn(nextRaiseDateAfter(scale, r.toStep ?? 1, Number(r.toBeyondPct ?? 0), r.kind === 'EARLY' ? ymdOf(r.dueDate) : eff))
                : null,
              decisionNo: input.decisionNo,
              decisionDate: input.decisionDate,
              note: RAISE_KIND_LABELS[r.kind],
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          });
          resultSalaryId = sal.id;
          changed.push({ employeeId: r.employeeId, fromDate: eff, reason: `${RAISE_KIND_LABELS[r.kind]} (QĐ ${input.decisionNo})` });
        }
        await tx.salaryRaise.update({
          where: { id: r.id },
          data: {
            status: input.approve ? 'APPROVED' : 'REJECTED',
            decisionNo: input.decisionNo,
            decisionDate: input.decisionDate,
            resultSalaryId,
            decidedBy: actor.id,
            decidedAt: now,
          },
        });
      }
      await this.audit.log(
        { actor, action: input.approve ? 'APPROVE' : 'REJECT', entity: 'salary_raise', entityId: raises[0].id, after: { ids: input.ids, decisionNo: input.decisionNo }, meta },
        tx,
      );
    });
    for (const e of changed) this.events.emit(SALARY_CHANGED_EVENT, e);
    return { updated: raises.length };
  }

  private where(actor: AuthUser, q: ListRaisesQuery): Prisma.SalaryRaiseWhereInput {
    return { status: q.status, employee: { ...this.employees.scope(actor), unitId: q.unitId } };
  }

  async list(actor: AuthUser, q: ListRaisesQuery) {
    const where = this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salaryRaise.findMany({
        where,
        include: { employee: { select: { id: true, code: true, fullName: true, unit: { select: { name: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { dueDate: 'asc' }],
        ...toSkipTake(q),
      }),
      this.prisma.salaryRaise.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.prisma.salaryRaise.findFirst({ where: { id, employee: this.employees.scope(actor) } });
    if (!r) throw new NotFoundException('Không tìm thấy đề xuất');
    if (r.status !== 'PROPOSED') throw new BadRequestException('Chỉ xóa được đề xuất chưa duyệt');
    await this.prisma.$transaction(async (tx) => {
      await tx.salaryRaise.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'salary_raise', entityId: id, before: r, meta }, tx);
    });
  }

  exportRows(actor: AuthUser, q: ListRaisesQuery) {
    return this.prisma.salaryRaise.findMany({
      where: this.where(actor, q),
      include: { employee: { select: { code: true, fullName: true, unit: { select: { name: true } } } } },
      orderBy: [{ employee: { code: 'asc' } }],
      take: 10000,
    });
  }
}
