import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Employee, Prisma } from '@bachmai/db';
import {
  ACTIVE_EMPLOYEE_STATUSES,
  maskSensitive,
  normalizeSearch,
  type CreateEmployeeInput,
  type ListEmployeesQuery,
  type UpdateEmployeeInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { scopeWhere } from '../../common/auth/data-scope';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { paginated, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { CatalogsService } from '../catalogs/catalogs.service';
import { FilesService } from '../files/files.service';
import { IntegrationsService } from '../integrations/integrations.service';

export const EMPLOYEE_FILE_OWNER = 'employee';

/** Phát khi mã chấm công của hồ sơ thay đổi — module chấm công gắn lại các lượt quét */
export const ATTENDANCE_CODE_CHANGED_EVENT = 'employee.attendance-code-changed';
export interface AttendanceCodeChangedEvent {
  employeeId: string;
  attendanceCode: string | null;
}

const LIST_SELECT = {
  id: true,
  code: true,
  fullName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  status: true,
  positionCode: true,
  jobTitleCode: true,
  contractTypeCode: true,
  educationLevelCode: true,
  startDate: true,
  photoFileId: true,
  userId: true,
  source: true,
  campus: { select: { id: true, code: true, name: true } },
  unit: { select: { id: true, code: true, name: true } },
} satisfies Prisma.EmployeeSelect;

const DETAIL_INCLUDE = {
  campus: { select: { id: true, code: true, name: true } },
  unit: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, username: true, status: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeDetail = Prisma.EmployeeGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Các trường nhạy cảm: tên trong API ↔ cột mã hóa trong DB */
const SENSITIVE = [
  ['idNumber', 'idNumberEnc'],
  ['taxCode', 'taxCodeEnc'],
  ['bankAccountNo', 'bankAccountEnc'],
] as const;

const CATALOG_FIELDS = [
  ['ETHNICITY', 'ethnicityCode'],
  ['RELIGION', 'religionCode'],
  ['BANK', 'bankCode'],
  ['POSITION', 'positionCode'],
  ['JOB_TITLE', 'jobTitleCode'],
  ['CONTRACT_TYPE', 'contractTypeCode'],
  ['EDUCATION_LEVEL', 'educationLevelCode'],
  ['ACADEMIC_TITLE', 'academicTitleCode'],
] as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
    private readonly catalogs: CatalogsService,
    private readonly files: FilesService,
    private readonly integrations: IntegrationsService,
    private readonly passwords: PasswordService,
    private readonly events: EventEmitter2,
  ) {
    files.registerAccessChecker(EMPLOYEE_FILE_OWNER, (user, employeeId) => this.canRead(user, employeeId));
  }

  // ================= PHÂN QUYỀN =================

  scope(actor: AuthUser): Prisma.EmployeeWhereInput {
    return { deletedAt: null, ...scopeWhere(actor, { campus: 'campusId', unit: 'unitId', self: 'userId' }) };
  }

  /**
   * Lấy hồ sơ nếu người dùng được xem: có quyền hr.employee.read trong phạm vi dữ liệu,
   * hoặc (khi allowSelf) là hồ sơ của chính mình.
   */
  async findAccessible(actor: AuthUser, id: string, allowSelf = true): Promise<Employee> {
    if (actor.permissions.has('hr.employee.read')) {
      const e = await this.prisma.employee.findFirst({ where: { id, ...this.scope(actor) } });
      if (e) return e;
    }
    if (allowSelf && actor.permissions.has('self.profile.read')) {
      const e = await this.prisma.employee.findFirst({ where: { id, userId: actor.id, deletedAt: null } });
      if (e) return e;
    }
    throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
  }

  async canRead(actor: AuthUser, id: string) {
    try {
      await this.findAccessible(actor, id);
      return true;
    } catch {
      return false;
    }
  }

  /** Hồ sơ trong phạm vi + quyền sửa (không áp dụng cho bản thân). */
  async findWritable(actor: AuthUser, id: string): Promise<Employee> {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.scope(actor) } });
    if (!e) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
    return e;
  }

  // ================= TRA CỨU =================

  async buildWhere(actor: AuthUser, q: ListEmployeesQuery): Promise<Prisma.EmployeeWhereInput> {
    let unitIds: string[] | undefined;
    if (q.unitId) unitIds = q.includeSubUnits ? await this.descendantUnitIds(q.unitId) : [q.unitId];
    const search = normalizeSearch(q.search);
    return {
      AND: [
        this.scope(actor),
        {
          campusId: q.campusId,
          unitId: unitIds ? { in: unitIds } : undefined,
          status:
            q.status === 'ALL'
              ? undefined
              : q.status === 'ACTIVE'
                ? { in: ACTIVE_EMPLOYEE_STATUSES }
                : (q.status as Employee['status']),
          gender: q.gender as Employee['gender'] | undefined,
          positionCode: q.positionCode,
          jobTitleCode: q.jobTitleCode,
          contractTypeCode: q.contractTypeCode,
          userId: q.hasAccount === undefined ? undefined : q.hasAccount ? { not: null } : null,
          searchText: search ? { contains: search } : undefined,
        },
      ],
    };
  }

  async list(actor: AuthUser, q: ListEmployeesQuery) {
    const where = await this.buildWhere(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, select: LIST_SELECT, orderBy: [{ code: 'asc' }], ...toSkipTake(q) }),
      this.prisma.employee.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  /** Toàn bộ kết quả lọc để xuất Excel (tối đa 20.000). */
  async listForExport(actor: AuthUser, q: ListEmployeesQuery) {
    const where = await this.buildWhere(actor, q);
    const rows = await this.prisma.employee.findMany({ where, include: DETAIL_INCLUDE, orderBy: { code: 'asc' }, take: 20_000 });
    const seeSensitive = actor.permissions.has('hr.sensitive.read');
    return rows.map((e) => this.toDetail(e, seeSensitive));
  }

  async get(actor: AuthUser, id: string) {
    const e = await this.findAccessible(actor, id);
    const full = await this.prisma.employee.findUniqueOrThrow({ where: { id: e.id }, include: DETAIL_INCLUDE });
    const isSelf = full.userId === actor.id;
    return this.toDetail(full, isSelf || actor.permissions.has('hr.sensitive.read'));
  }

  async me(actor: AuthUser) {
    const e = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, include: DETAIL_INCLUDE });
    return e ? this.toDetail(e, true) : null;
  }

  /** Lịch sử thay đổi hồ sơ (audit log của hồ sơ và các hồ sơ con). */
  async history(actor: AuthUser, id: string) {
    await this.findAccessible(actor, id, false);
    const rows = await this.prisma.auditLog.findMany({
      where: { entityId: id, entity: { startsWith: 'employee' } },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }

  // ================= GHI =================

  async create(actor: AuthUser, input: CreateEmployeeInput, meta: RequestMeta) {
    await this.validate(input, null);
    const e = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: { ...this.toData(input, null), code: input.code, createdBy: actor.id, updatedBy: actor.id } as Prisma.EmployeeUncheckedCreateInput,
      });
      await this.files.attach([input.photoFileId], EMPLOYEE_FILE_OWNER, created.id, actor, tx);
      await this.audit.log({ actor, action: 'CREATE', entity: 'employee', entityId: created.id, after: this.auditView(created), meta }, tx);
      return created;
    });
    if (e.attendanceCode) this.emitCode(e.id, e.attendanceCode);
    return this.get(actor, e.id);
  }

  async update(actor: AuthUser, id: string, input: UpdateEmployeeInput, meta: RequestMeta) {
    const before = await this.findWritable(actor, id);
    await this.integrations.assertWritable('hr.employee', before.source);
    await this.validate(input, before);
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({
        where: { id },
        data: { ...this.toData(input, before), updatedBy: actor.id },
      });
      await this.files.attach([input.photoFileId], EMPLOYEE_FILE_OWNER, id, actor, tx);
      await this.audit.log(
        {
          actor,
          action: 'UPDATE',
          entity: 'employee',
          entityId: id,
          before: this.auditView(before),
          after: { ...this.auditView(e), sensitiveChanged: SENSITIVE.filter(([k]) => k in input).map(([k]) => k) },
          meta,
        },
        tx,
      );
      return e;
    }).then((e) => {
      if ('attendanceCode' in input && input.attendanceCode !== before.attendanceCode) this.emitCode(e.id, e.attendanceCode);
      return this.get(actor, e.id);
    });
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const before = await this.findWritable(actor, id);
    await this.integrations.assertWritable('hr.employee', before.source);
    await this.prisma.$transaction(async (tx) => {
      // Giải phóng mã CCCD để có thể nhập lại; giữ nguyên dữ liệu mã hóa
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), idNumberHash: null, userId: null, updatedBy: actor.id } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'employee', entityId: id, before: this.auditView(before), meta }, tx);
    });
  }

  /** Tạo tài khoản đăng nhập nhóm "Nhân viên" cho hồ sơ; tên đăng nhập = mã nhân viên (chữ thường). */
  async createAccount(actor: AuthUser, id: string, meta: RequestMeta) {
    const e = await this.findWritable(actor, id);
    if (e.userId) throw new ConflictException('Nhân viên đã có tài khoản');
    const username = e.code.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw new ConflictException(`Tên đăng nhập "${username}" đã được sử dụng`);
    }
    const role = await this.prisma.role.findUnique({ where: { code: 'NHAN_VIEN' } });
    if (!role) throw new BadRequestException('Chưa có nhóm tài khoản NHAN_VIEN');
    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username,
          fullName: e.fullName,
          email: e.email,
          phone: e.phone,
          campusId: e.campusId,
          unitId: e.unitId,
          passwordHash,
          mustChangePassword: true,
          createdBy: actor.id,
          roles: { create: [{ roleId: role.id }] },
        },
      });
      await tx.employee.update({ where: { id }, data: { userId: u.id } });
      await this.audit.log({ actor, action: 'CREATE_ACCOUNT', entity: 'employee', entityId: id, after: { username }, meta }, tx);
    });
    return { username, temporaryPassword };
  }

  // ================= NỘI BỘ =================

  private emitCode(employeeId: string, attendanceCode: string | null) {
    const e: AttendanceCodeChangedEvent = { employeeId, attendanceCode };
    this.events.emit(ATTENDANCE_CODE_CHANGED_EVENT, e);
  }

  private async validate(input: UpdateEmployeeInput & { code?: string }, existing: Employee | null) {
    const errors: Record<string, string[]> = {};
    if (input.attendanceCode) {
      const dup = await this.prisma.employee.findFirst({
        where: { attendanceCode: input.attendanceCode, id: existing ? { not: existing.id } : undefined },
        select: { code: true, fullName: true },
      });
      if (dup) errors.attendanceCode = [`Mã chấm công đã gắn cho ${dup.code} — ${dup.fullName}`];
    }
    if (input.code && !existing) {
      const dup = await this.prisma.employee.findUnique({ where: { code: input.code } });
      if (dup) errors.code = [`Mã nhân viên đã tồn tại${dup.deletedAt ? ' (hồ sơ đã xóa)' : ''}`];
    }
    if (input.idNumber) {
      const dup = await this.prisma.employee.findFirst({
        where: { idNumberHash: this.encryption.blindIndex(input.idNumber), id: existing ? { not: existing.id } : undefined },
        select: { code: true, fullName: true },
      });
      if (dup) errors.idNumber = [`Số CCCD đã có ở hồ sơ ${dup.code} — ${dup.fullName}`];
    }
    if (input.campusId && !(await this.prisma.campus.findFirst({ where: { id: input.campusId, deletedAt: null } }))) {
      errors.campusId = ['Cơ sở không tồn tại'];
    }
    if (input.unitId && !(await this.prisma.unit.findFirst({ where: { id: input.unitId, deletedAt: null } }))) {
      errors.unitId = ['Đơn vị không tồn tại'];
    }
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Dữ liệu không hợp lệ', errors });
    await this.catalogs.assertCodes(CATALOG_FIELDS.map(([type, field]) => [type, input[field], field]));
  }

  /** Chuyển input API → dữ liệu Prisma: mã hóa trường nhạy cảm, tính lại search_text. */
  private toData(input: UpdateEmployeeInput & { code?: string }, existing: Employee | null): Prisma.EmployeeUncheckedUpdateInput {
    const { idNumber, taxCode, bankAccountNo, ...plain } = input;
    const data: Prisma.EmployeeUncheckedUpdateInput = { ...plain };
    if (idNumber !== undefined) {
      data.idNumberEnc = this.encryption.encrypt(idNumber);
      data.idNumberHash = this.encryption.blindIndex(idNumber);
    }
    if (taxCode !== undefined) data.taxCodeEnc = this.encryption.encrypt(taxCode);
    if (bankAccountNo !== undefined) data.bankAccountEnc = this.encryption.encrypt(bankAccountNo);

    const pick = <K extends 'code' | 'fullName' | 'phone' | 'email'>(k: K) =>
      (k in input ? (input as Record<string, unknown>)[k] : existing?.[k]) as string | null | undefined;
    data.searchText = normalizeSearch([pick('code'), pick('fullName'), pick('phone'), pick('email')].filter(Boolean).join(' '));
    return data;
  }

  private toDetail(e: EmployeeDetail, seeSensitive: boolean) {
    const { idNumberEnc, idNumberHash: _h, taxCodeEnc, bankAccountEnc, searchText: _s, ...rest } = e;
    const reveal = (enc: string | null) => {
      const v = this.encryption.decrypt(enc);
      return seeSensitive ? v : maskSensitive(v);
    };
    return {
      ...rest,
      idNumber: reveal(idNumberEnc),
      taxCode: reveal(taxCodeEnc),
      bankAccountNo: reveal(bankAccountEnc),
      sensitiveMasked: !seeSensitive,
    };
  }

  /** Bản ghi cho audit log — không chứa dữ liệu nhạy cảm (AuditService loại bỏ cột *_enc). */
  private auditView(e: Employee) {
    return { ...e };
  }

  private async descendantUnitIds(rootId: string) {
    const units = await this.prisma.unit.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) for (const u of units) if (u.parentId === ids[i]) ids.push(u.id);
    return ids;
  }
}
