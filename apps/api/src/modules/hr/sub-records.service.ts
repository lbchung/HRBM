import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Employee, Prisma } from '@bachmai/db';
import {
  EMPLOYEE_SUB_RESOURCE_SCHEMAS,
  SUB_RECORD_RULES,
  type CatalogType,
  type EmployeeSubResource,
  type IntegrationEntity,
  type PermissionCode,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogsService } from '../catalogs/catalogs.service';
import { FilesService } from '../files/files.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EMPLOYEE_FILE_OWNER, EmployeesService } from './employees.service';

/** Lương / phụ cấp / hệ số thu nhập thay đổi → module lương tính truy lĩnh nếu hồi tố */
export const SALARY_CHANGED_EVENT = 'employee.salary-changed';
export interface SalaryChangedEvent {
  employeeId: string;
  /** Ngày hiệu lực sớm nhất bị ảnh hưởng (YYYY-MM-DD) */
  fromDate: string;
  reason: string;
}
const SALARY_RESOURCES: EmployeeSubResource[] = ['salaries', 'allowances', 'income-coefficients'];
const RESOURCE_LABELS: Partial<Record<EmployeeSubResource, string>> = {
  salaries: 'Thay đổi diễn biến lương',
  allowances: 'Thay đổi phụ cấp',
  'income-coefficients': 'Thay đổi hệ số thu nhập',
};

interface ResourceConfig {
  /** Tên delegate Prisma (prisma.<delegate>) */
  delegate: string;
  /** Quyền xem (ít nhất một) ngoài trường hợp xem hồ sơ của chính mình */
  read: PermissionCode[];
  write: PermissionCode;
  /** Nguồn chuẩn cần kiểm tra khi hồ sơ đồng bộ từ Fast */
  ownership?: IntegrationEntity;
  catalogs: [CatalogType, string][];
  fileFields: string[];
  orderBy: Record<string, 'asc' | 'desc'>[];
  include?: Record<string, unknown>;
}

const UNIT_REF = { select: { id: true, code: true, name: true } };

export const SUB_RESOURCES: Record<EmployeeSubResource, ResourceConfig> = {
  family: {
    delegate: 'employeeFamilyMember',
    read: ['hr.employee.read'],
    write: 'hr.employee.update',
    catalogs: [['RELATIONSHIP', 'relationshipCode']],
    fileFields: [],
    orderBy: [{ createdAt: 'asc' }],
  },
  'work-history': {
    delegate: 'employeeWorkHistory',
    read: ['hr.employee.read'],
    write: 'hr.employee.update',
    ownership: 'hr.work_history',
    catalogs: [
      ['WORK_EVENT_TYPE', 'eventTypeCode'],
      ['POSITION', 'positionCode'],
      ['JOB_TITLE', 'jobTitleCode'],
    ],
    fileFields: [],
    orderBy: [{ effectiveDate: 'desc' }],
    include: { fromUnit: UNIT_REF, toUnit: UNIT_REF },
  },
  contracts: {
    delegate: 'employeeContract',
    read: ['hr.employee.read'],
    write: 'hr.employee.update',
    ownership: 'hr.contract',
    catalogs: [['CONTRACT_TYPE', 'contractTypeCode']],
    fileFields: ['fileId'],
    orderBy: [{ startDate: 'desc' }],
  },
  assignments: {
    delegate: 'campusAssignment',
    read: ['hr.employee.read'],
    write: 'hr.assignment.manage',
    catalogs: [],
    fileFields: [],
    orderBy: [{ fromDate: 'desc' }],
    include: { campus: UNIT_REF, unit: UNIT_REF },
  },
  documents: {
    delegate: 'employeeDocument',
    read: ['hr.employee.read'],
    write: 'hr.employee.update',
    catalogs: [['DOCUMENT_TYPE', 'categoryCode']],
    fileFields: ['fileId'],
    orderBy: [{ createdAt: 'desc' }],
  },
  trainings: {
    delegate: 'employeeTraining',
    read: ['hr.employee.read'],
    write: 'hr.training.manage',
    catalogs: [['TRAINING_TYPE', 'trainingTypeCode']],
    fileFields: ['fileId'],
    orderBy: [{ toDate: 'desc' }, { createdAt: 'desc' }],
  },
  rewards: {
    delegate: 'employeeReward',
    read: ['hr.employee.read'],
    write: 'hr.reward.manage',
    catalogs: [
      ['REWARD_FORM', 'formCode'],
      ['REWARD_LEVEL', 'levelCode'],
    ],
    fileFields: [],
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  },
  disciplines: {
    delegate: 'employeeDiscipline',
    read: ['hr.employee.read'],
    write: 'hr.reward.manage',
    catalogs: [['DISCIPLINE_FORM', 'formCode']],
    fileFields: [],
    orderBy: [{ effectiveFrom: 'desc' }],
  },
  salaries: {
    delegate: 'employeeSalary',
    read: ['hr.salary.read'],
    write: 'hr.salary.manage',
    ownership: 'hr.salary',
    catalogs: [['JOB_TITLE', 'scaleCode']],
    fileFields: [],
    orderBy: [{ effectiveFrom: 'desc' }],
  },
  allowances: {
    delegate: 'employeeAllowance',
    read: ['hr.salary.read'],
    write: 'hr.salary.manage',
    ownership: 'hr.salary',
    catalogs: [['ALLOWANCE_TYPE', 'allowanceTypeCode']],
    fileFields: [],
    orderBy: [{ effectiveFrom: 'desc' }],
  },
  'income-coefficients': {
    delegate: 'employeeIncomeCoefficient',
    read: ['hr.salary.read'],
    write: 'hr.salary.manage',
    ownership: 'hr.salary',
    catalogs: [],
    fileFields: [],
    orderBy: [{ effectiveFrom: 'desc' }],
  },
};

/** Delegate Prisma truy cập động — mọi input đã qua Zod schema trước khi tới đây. */
type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
};

@Injectable()
export class SubRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
    private readonly catalogs: CatalogsService,
    private readonly files: FilesService,
    private readonly integrations: IntegrationsService,
    private readonly events: EventEmitter2,
  ) {}

  private emitSalaryChanged(resource: EmployeeSubResource, employeeId: string, ...rows: (Record<string, unknown> | null | undefined)[]) {
    if (!SALARY_RESOURCES.includes(resource)) return;
    const dates = rows.map((r) => r?.effectiveFrom).filter((d): d is Date => d instanceof Date);
    if (!dates.length) return;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const e: SalaryChangedEvent = { employeeId, fromDate: min.toISOString().slice(0, 10), reason: RESOURCE_LABELS[resource]! };
    this.events.emit(SALARY_CHANGED_EVENT, e);
  }

  private delegate(tx: Prisma.TransactionClient, cfg: ResourceConfig): Delegate {
    return (tx as unknown as Record<string, Delegate>)[cfg.delegate];
  }

  async list(actor: AuthUser, employeeId: string, resource: EmployeeSubResource) {
    const cfg = SUB_RESOURCES[resource];
    const emp = await this.employees.findAccessible(actor, employeeId);
    const isSelf = emp.userId === actor.id;
    if (!isSelf && !cfg.read.some((p) => actor.permissions.has(p))) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin này');
    }
    return this.delegate(this.prisma, cfg).findMany({ where: { employeeId }, orderBy: cfg.orderBy, include: cfg.include });
  }

  async create(actor: AuthUser, employeeId: string, resource: EmployeeSubResource, body: unknown, meta: RequestMeta) {
    const cfg = SUB_RESOURCES[resource];
    const emp = await this.assertWritable(actor, employeeId, cfg);
    const { applyToProfile, ...data } = this.parse(resource, body, false) as Record<string, unknown> & { applyToProfile?: boolean };
    this.checkRules(resource, data);
    await this.validateRefs(cfg, data);
    if (resource === 'assignments') await this.assertNoOverlap(employeeId, data, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.delegate(tx, cfg).create({
        data: { ...data, employeeId, createdBy: actor.id, updatedBy: actor.id },
        include: cfg.include,
      });
      await this.files.attach(cfg.fileFields.map((f) => data[f] as string | null), EMPLOYEE_FILE_OWNER, employeeId, actor, tx);
      if (resource === 'work-history' && applyToProfile) await this.applyWorkHistory(tx, emp, data, actor);
      await this.audit.log({ actor, action: 'CREATE', entity: `employee.${resource}`, entityId: employeeId, after: row, meta }, tx);
      return row;
    });
    this.emitSalaryChanged(resource, employeeId, created);
    return created;
  }

  async update(actor: AuthUser, employeeId: string, resource: EmployeeSubResource, recordId: string, body: unknown, meta: RequestMeta) {
    const cfg = SUB_RESOURCES[resource];
    const emp = await this.assertWritable(actor, employeeId, cfg);
    const before = await this.findRecord(cfg, employeeId, recordId);
    const { applyToProfile, ...data } = this.parse(resource, body, true) as Record<string, unknown> & { applyToProfile?: boolean };
    const merged = { ...before, ...data };
    this.checkRules(resource, merged);
    await this.validateRefs(cfg, data);
    if (resource === 'assignments') await this.assertNoOverlap(employeeId, merged, recordId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.delegate(tx, cfg).update({
        where: { id: recordId },
        data: { ...data, updatedBy: actor.id },
        include: cfg.include,
      });
      await this.files.attach(cfg.fileFields.map((f) => data[f] as string | null), EMPLOYEE_FILE_OWNER, employeeId, actor, tx);
      if (resource === 'work-history' && applyToProfile) await this.applyWorkHistory(tx, emp, merged, actor);
      await this.audit.log({ actor, action: 'UPDATE', entity: `employee.${resource}`, entityId: employeeId, before, after: row, meta }, tx);
      return row;
    });
    this.emitSalaryChanged(resource, employeeId, before, updated);
    return updated;
  }

  async remove(actor: AuthUser, employeeId: string, resource: EmployeeSubResource, recordId: string, meta: RequestMeta) {
    const cfg = SUB_RESOURCES[resource];
    await this.assertWritable(actor, employeeId, cfg);
    const before = await this.findRecord(cfg, employeeId, recordId);
    await this.prisma.$transaction(async (tx) => {
      await this.delegate(tx, cfg).delete({ where: { id: recordId } });
      await this.audit.log({ actor, action: 'DELETE', entity: `employee.${resource}`, entityId: employeeId, before, meta }, tx);
    });
    this.emitSalaryChanged(resource, employeeId, before);
  }

  // ================= NỘI BỘ =================

  private async assertWritable(actor: AuthUser, employeeId: string, cfg: ResourceConfig): Promise<Employee> {
    if (!actor.permissions.has(cfg.write)) throw new ForbiddenException('Bạn không có quyền cập nhật thông tin này');
    const emp = await this.employees.findWritable(actor, employeeId);
    if (cfg.ownership) await this.integrations.assertWritable(cfg.ownership, emp.source);
    return emp;
  }

  private async findRecord(cfg: ResourceConfig, employeeId: string, recordId: string) {
    const row = await this.delegate(this.prisma, cfg).findFirst({ where: { id: recordId, employeeId } });
    if (!row) throw new NotFoundException('Không tìm thấy bản ghi');
    return row;
  }

  private parse(resource: EmployeeSubResource, body: unknown, partial: boolean) {
    const base = EMPLOYEE_SUB_RESOURCE_SCHEMAS[resource];
    const schema = partial ? base.partial() : base;
    const r = schema.safeParse(body);
    if (!r.success) {
      throw new BadRequestException({ message: 'Dữ liệu không hợp lệ', errors: r.error.flatten().fieldErrors });
    }
    // Bỏ các trường undefined để update không ghi đè
    return Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined));
  }

  private checkRules(resource: EmployeeSubResource, data: Record<string, unknown>) {
    const messages = (SUB_RECORD_RULES[resource] ?? []).map((rule) => rule(data)).filter((m): m is string => !!m);
    if (messages.length) throw new BadRequestException(messages.join('; '));
  }

  private async validateRefs(cfg: ResourceConfig, data: Record<string, unknown>) {
    await this.catalogs.assertCodes(cfg.catalogs.map(([type, field]) => [type, data[field] as string | null | undefined, field]));
    for (const field of ['campusId', 'fromUnitId', 'toUnitId', 'unitId'] as const) {
      const id = data[field] as string | null | undefined;
      if (!id) continue;
      const exists =
        field === 'campusId'
          ? await this.prisma.campus.findFirst({ where: { id, deletedAt: null } })
          : await this.prisma.unit.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new BadRequestException({ message: 'Dữ liệu không hợp lệ', errors: { [field]: ['Không tồn tại'] } });
    }
  }

  /** Một nhân viên không được có hai phân công chồng lấn thời gian. */
  private async assertNoOverlap(employeeId: string, data: Record<string, unknown>, excludeId: string | null) {
    const from = data.fromDate as Date;
    const to = data.toDate as Date;
    const clash = await this.prisma.campusAssignment.findFirst({
      where: { employeeId, id: excludeId ? { not: excludeId } : undefined, fromDate: { lte: to }, toDate: { gte: from } },
      include: { campus: { select: { name: true } } },
    });
    if (clash) {
      const f = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
      throw new BadRequestException(`Trùng thời gian với phân công tại ${clash.campus.name} (${f(clash.fromDate)} – ${f(clash.toDate)})`);
    }
  }

  /** Cập nhật đơn vị / chức vụ / chức danh hiện tại của hồ sơ theo quá trình công tác. */
  private async applyWorkHistory(tx: Prisma.TransactionClient, emp: Employee, data: Record<string, unknown>, actor: AuthUser) {
    await this.integrations.assertWritable('hr.employee', emp.source);
    const patch: Prisma.EmployeeUncheckedUpdateInput = {};
    if (data.toUnitId) patch.unitId = data.toUnitId as string;
    if (data.positionCode) patch.positionCode = data.positionCode as string;
    if (data.jobTitleCode) patch.jobTitleCode = data.jobTitleCode as string;
    if (!Object.keys(patch).length) return;
    await tx.employee.update({ where: { id: emp.id }, data: { ...patch, updatedBy: actor.id } });
    await this.audit.log(
      {
        actor,
        action: 'UPDATE',
        entity: 'employee',
        entityId: emp.id,
        before: { unitId: emp.unitId, positionCode: emp.positionCode, jobTitleCode: emp.jobTitleCode },
        after: { ...patch, reason: 'Cập nhật theo quá trình công tác' },
      },
      tx,
    );
  }
}
