import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@bachmai/db';
import { pickEffective, ymdOf, type CreateDutyRateInput, type CreateShiftInput, type HolidayInput, type UpdateShiftInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.shift.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  create(actor: AuthUser, input: CreateShiftInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.shift.create({ data: { ...input, createdBy: actor.id, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'shift', entityId: s.id, after: s, meta }, tx);
      return s;
    });
  }

  async update(actor: AuthUser, id: string, input: UpdateShiftInput, meta: RequestMeta) {
    const before = await this.prisma.shift.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy ca');
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.shift.update({ where: { id }, data: { ...input, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'shift', entityId: id, before, after: s, meta }, tx);
      return s;
    });
  }

  // -------- Tiền trực --------

  async dutyRates() {
    const shifts = await this.prisma.shift.findMany({
      where: { type: 'DUTY' },
      include: { dutyRates: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    const today = ymdOf(new Date());
    return shifts.map((s) => {
      const versions = s.dutyRates.map((r) => ({ ...r, effectiveFrom: ymdOf(r.effectiveFrom), value: r.amount.toString() }));
      return { shift: { id: s.id, code: s.code, name: s.name, isActive: s.isActive }, current: pickEffective(versions, today) ?? null, versions };
    });
  }

  async addDutyRate(actor: AuthUser, shiftId: string, input: CreateDutyRateInput, meta: RequestMeta) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.type !== 'DUTY') throw new BadRequestException('Chỉ khai báo tiền trực cho ca trực');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.dutyPayRate.create({ data: { ...input, shiftId, createdBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'duty_pay_rate', entityId: r.id, after: r, meta }, tx);
      return r;
    });
  }

  async removeDutyRate(actor: AuthUser, id: string, meta: RequestMeta) {
    const r = await this.prisma.dutyPayRate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (ymdOf(r.effectiveFrom) <= ymdOf(new Date())) throw new BadRequestException('Không xóa được mức tiền trực đã có hiệu lực — hãy thêm mức mới');
    await this.prisma.$transaction(async (tx) => {
      await tx.dutyPayRate.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'duty_pay_rate', entityId: id, before: r, meta }, tx);
    });
  }

  /** Bảng tra mức tiền trực theo ca, có hiệu lực tại từng ngày */
  async rateResolver() {
    const rates = await this.prisma.dutyPayRate.findMany();
    const byShift = new Map<string, { effectiveFrom: string; value: string }[]>();
    for (const r of rates) byShift.set(r.shiftId, [...(byShift.get(r.shiftId) ?? []), { effectiveFrom: ymdOf(r.effectiveFrom), value: r.amount.toString() }]);
    return (shiftId: string, date: string) => pickEffective(byShift.get(shiftId) ?? [], date)?.value ?? null;
  }

  // -------- Ngày lễ --------

  holidays(year?: number) {
    return this.prisma.holiday.findMany({
      where: year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {},
      orderBy: { date: 'asc' },
    });
  }

  async addHoliday(actor: AuthUser, input: HolidayInput, meta: RequestMeta) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const h = await tx.holiday.create({ data: { ...input, createdBy: actor.id } });
        await this.audit.log({ actor, action: 'CREATE', entity: 'holiday', entityId: h.id, after: h, meta }, tx);
        return h;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BadRequestException('Ngày này đã có trong danh sách');
      throw e;
    }
  }

  async removeHoliday(actor: AuthUser, id: string, meta: RequestMeta) {
    const h = await this.prisma.holiday.findUnique({ where: { id } });
    if (!h) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'holiday', entityId: id, before: h, meta }, tx);
    });
    return h;
  }

  // -------- Ca mặc định của đơn vị --------

  async setUnitDefault(actor: AuthUser, unitId: string, shiftId: string | null, meta: RequestMeta) {
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Không tìm thấy đơn vị');
    await this.prisma.$transaction(async (tx) => {
      await tx.unit.update({ where: { id: unitId }, data: { defaultShiftId: shiftId, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'UPDATE', entity: 'unit', entityId: unitId, before: { defaultShiftId: unit.defaultShiftId }, after: { defaultShiftId: shiftId }, meta }, tx);
    });
    return { ok: true };
  }
}
