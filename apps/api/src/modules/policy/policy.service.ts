import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@bachmai/db';
import {
  pickEffective,
  POLICY_PARAMETERS,
  type CreateParameterVersionInput,
  type PolicyParameterCode,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Hôm nay theo giờ Việt Nam */
const todayVN = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Danh sách tham số kèm lịch sử phiên bản; ngày hết hiệu lực suy ra từ phiên bản kế tiếp. */
  async list() {
    const rows = await this.prisma.policyParameter.findMany({ orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }] });
    const today = todayVN();
    return POLICY_PARAMETERS.map((def) => {
      const versions = rows
        .filter((r) => r.code === def.code)
        .map((r) => ({ ...r, effectiveFrom: ymd(r.effectiveFrom), value: r.value.toString() }));
      const withEnd = versions.map((v, i) => {
        const newer = versions[i - 1]; // sắp xếp giảm dần
        const end = newer ? new Date(Date.parse(`${newer.effectiveFrom}T00:00:00Z`) - 86_400_000) : null;
        return { ...v, effectiveTo: end ? ymd(end) : null };
      });
      return { ...def, current: pickEffective(versions, today) ?? null, versions: withEnd };
    });
  }

  /** Giá trị tham số tại một ngày — dùng cho tính lương, thuế, truy lĩnh. */
  async valueAt(code: PolicyParameterCode, date: Date): Promise<Prisma.Decimal> {
    const row = await this.prisma.policyParameter.findFirst({
      where: { code, effectiveFrom: { lte: date } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!row) throw new NotFoundException(`Chưa khai báo tham số ${code} có hiệu lực tại ngày ${ymd(date)}`);
    return row.value;
  }

  async create(actor: AuthUser, input: CreateParameterVersionInput, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.policyParameter.create({ data: { ...input, createdBy: actor.id } });
      await this.audit.log({ actor, action: 'CREATE', entity: 'policy_parameter', entityId: row.id, after: row, meta }, tx);
      return row;
    });
  }

  /** Chỉ xóa được phiên bản chưa có hiệu lực — phiên bản đã áp dụng là căn cứ tính lương/truy lĩnh. */
  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const row = await this.prisma.policyParameter.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản tham số');
    if (ymd(row.effectiveFrom) <= todayVN()) {
      throw new BadRequestException('Không thể xóa phiên bản đã có hiệu lực. Hãy thêm phiên bản mới để thay thế.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.policyParameter.delete({ where: { id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'policy_parameter', entityId: id, before: row, meta }, tx);
    });
  }
}
