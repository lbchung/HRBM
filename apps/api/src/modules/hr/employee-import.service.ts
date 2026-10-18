import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createEmployeeSchema,
  GENDERS,
  normalizeSearch,
  type CatalogType,
  type CreateEmployeeInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { ExcelService, type CellValue } from '../../common/excel/excel.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IntegrationsService } from '../integrations/integrations.service';

/** Cột file mẫu: tiêu đề (dấu * = bắt buộc) → trường; kèm loại danh mục để kiểm tra mã. */
export const IMPORT_COLUMNS: { header: string; field: string; catalog?: CatalogType; date?: boolean; width?: number }[] = [
  { header: 'Mã NV*', field: 'code' },
  { header: 'Họ và tên*', field: 'fullName', width: 26 },
  { header: 'Giới tính* (Nam/Nữ)', field: 'gender' },
  { header: 'Ngày sinh (dd/mm/yyyy)', field: 'dateOfBirth', date: true },
  { header: 'Mã cơ sở* (HN/NB)', field: 'campusCode' },
  { header: 'Mã đơn vị*', field: 'unitCode' },
  { header: 'Mã chức vụ', field: 'positionCode', catalog: 'POSITION' },
  { header: 'Mã chức danh', field: 'jobTitleCode', catalog: 'JOB_TITLE' },
  { header: 'Mã loại hợp đồng', field: 'contractTypeCode', catalog: 'CONTRACT_TYPE' },
  { header: 'Mã trình độ', field: 'educationLevelCode', catalog: 'EDUCATION_LEVEL' },
  { header: 'Chuyên ngành', field: 'specialty' },
  { header: 'Ngày vào làm (dd/mm/yyyy)', field: 'startDate', date: true },
  { header: 'Mã chấm công', field: 'attendanceCode' },
  { header: 'Số CCCD', field: 'idNumber' },
  { header: 'Ngày cấp CCCD', field: 'idIssueDate', date: true },
  { header: 'Nơi cấp CCCD', field: 'idIssuePlace' },
  { header: 'Mã số thuế', field: 'taxCode' },
  { header: 'Số sổ BHXH', field: 'socialInsuranceNo' },
  { header: 'Điện thoại', field: 'phone' },
  { header: 'Email', field: 'email', width: 26 },
  { header: 'Mã dân tộc', field: 'ethnicityCode', catalog: 'ETHNICITY' },
  { header: 'Số tài khoản', field: 'bankAccountNo' },
  { header: 'Mã ngân hàng', field: 'bankCode', catalog: 'BANK' },
  { header: 'Địa chỉ thường trú', field: 'permanentAddress', width: 34 },
  { header: 'Địa chỉ hiện tại', field: 'currentAddress', width: 34 },
];

const GENDER_BY_LABEL = new Map(Object.entries(GENDERS).map(([k, v]) => [normalizeSearch(v), k]));

export interface ImportResult {
  total: number;
  valid: number;
  toCreate: number;
  toUpdate: number;
  errors: { row: number; code: string | null; messages: string[] }[];
  committed: boolean;
}

/** dd/mm/yyyy | yyyy-mm-dd | ô kiểu Date → yyyy-mm-dd */
export function toIsoDate(v: CellValue): string | null {
  if (v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  return s; // để schema báo lỗi định dạng
}

@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** File mẫu + sheet tra cứu mã. */
  async template(): Promise<Buffer> {
    const [campuses, units, catalog] = await Promise.all([
      this.prisma.campus.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.unit.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.catalogItem.findMany({
        where: { isActive: true, type: { in: IMPORT_COLUMNS.filter((c) => c.catalog).map((c) => c.catalog!) } },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      }),
    ]);
    const lookup = [
      ...campuses.map((c) => ({ group: 'Cơ sở', code: c.code, name: c.name })),
      ...units.map((u) => ({ group: 'Đơn vị', code: u.code, name: u.name })),
      ...catalog.map((i) => ({ group: IMPORT_COLUMNS.find((c) => c.catalog === i.type)!.header, code: i.code, name: i.name })),
    ];
    return this.excel.build([
      {
        name: 'Nhân viên',
        rows: [],
        columns: IMPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width ?? 18, value: () => null })),
      },
      {
        name: 'Tra cứu mã',
        rows: lookup,
        columns: [
          { header: 'Loại', width: 26, value: (r) => r.group },
          { header: 'Mã', width: 18, value: (r) => r.code },
          { header: 'Tên', width: 50, value: (r) => r.name },
        ],
      },
    ]);
  }

  /**
   * Kiểm tra (commit=false) hoặc ghi (commit=true). Chỉ ghi khi KHÔNG có dòng lỗi — tất cả hoặc không.
   * Trùng mã NV với hồ sơ đã có → cập nhật hồ sơ đó.
   */
  async run(actor: AuthUser, buffer: Buffer | undefined, commit: boolean, meta: RequestMeta): Promise<ImportResult> {
    if (!buffer) throw new BadRequestException('Chưa chọn file');
    const { headers, rows } = await this.excel.parse(buffer).catch(() => {
      throw new BadRequestException('Không đọc được file Excel (.xlsx)');
    });
    const missing = IMPORT_COLUMNS.filter((c) => c.header.includes('*') && !headers.includes(c.header)).map((c) => c.header);
    if (missing.length) throw new BadRequestException(`File thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng file mẫu.`);
    if (rows.length > 10_000) throw new BadRequestException('Tối đa 10.000 dòng mỗi lần import');

    const [campuses, units, catalog, existing] = await Promise.all([
      this.prisma.campus.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
      this.prisma.unit.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
      this.prisma.catalogItem.findMany({ select: { type: true, code: true } }),
      this.prisma.employee.findMany({ select: { id: true, code: true, idNumberHash: true, attendanceCode: true, source: true, deletedAt: true } }),
    ]);
    const campusByCode = new Map(campuses.map((c) => [c.code.toUpperCase(), c.id]));
    const unitByCode = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));
    const catalogSet = new Set(catalog.map((c) => `${c.type}:${c.code}`));
    const existingByCode = new Map(existing.map((e) => [e.code, e]));
    const idHashOwner = new Map(existing.filter((e) => e.idNumberHash).map((e) => [e.idNumberHash!, e.code]));
    const attendanceOwner = new Map(existing.filter((e) => e.attendanceCode).map((e) => [e.attendanceCode!, e.code]));
    const seenAttendance = new Set<string>();

    const errors: ImportResult['errors'] = [];
    const valid: { input: CreateEmployeeInput; existingId: string | null }[] = [];
    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();

    for (const { rowNumber, values } of rows) {
      const msgs: string[] = [];
      const raw: Record<string, unknown> = {};
      for (const col of IMPORT_COLUMNS) {
        const v = values[col.header] ?? null;
        raw[col.field] = col.date ? toIsoDate(v) : v === null ? null : String(v).trim();
      }
      const code = raw.code ? String(raw.code).toUpperCase() : null;
      raw.gender = raw.gender ? (GENDER_BY_LABEL.get(normalizeSearch(String(raw.gender))) ?? raw.gender) : raw.gender;
      raw.campusId = campusByCode.get(String(raw.campusCode ?? '').toUpperCase());
      raw.unitId = unitByCode.get(String(raw.unitCode ?? '').toUpperCase());
      if (raw.campusCode && !raw.campusId) msgs.push(`Mã cơ sở "${raw.campusCode}" không tồn tại`);
      if (raw.unitCode && !raw.unitId) msgs.push(`Mã đơn vị "${raw.unitCode}" không tồn tại`);
      for (const col of IMPORT_COLUMNS.filter((c) => c.catalog)) {
        const v = raw[col.field];
        if (v && !catalogSet.has(`${col.catalog}:${v}`)) msgs.push(`${col.header}: mã "${v}" không có trong danh mục`);
      }
      // Ô trống → '' để schema chuyển thành null
      const input = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? '']));
      delete input.campusCode;
      delete input.unitCode;
      if (!input.campusId) delete input.campusId;
      if (!input.unitId) delete input.unitId;

      const parsed = createEmployeeSchema.safeParse(input);
      if (!parsed.success) {
        for (const [field, fieldMsgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
          // Mã cơ sở / đơn vị sai đã báo ở trên
          if ((field === 'campusId' && raw.campusCode) || (field === 'unitId' && raw.unitCode)) continue;
          const header =
            IMPORT_COLUMNS.find((c) => c.field === field)?.header ??
            (field === 'campusId' ? 'Mã cơ sở*' : field === 'unitId' ? 'Mã đơn vị*' : field);
          const text = (fieldMsgs ?? []).map((m) => (m === 'Required' || m.startsWith('Invalid') ? 'bắt buộc / không hợp lệ' : m));
          msgs.push(`${header}: ${text.join(', ')}`);
        }
      }
      if (code) {
        if (seenCodes.has(code)) msgs.push('Trùng mã NV với dòng khác trong file');
        seenCodes.add(code);
      }
      const ex = code ? existingByCode.get(code) : undefined;
      if (ex?.deletedAt) msgs.push('Mã NV thuộc hồ sơ đã xóa');
      if (ex && ex.source === 'FAST') {
        try {
          await this.integrations.assertWritable('hr.employee', 'FAST');
        } catch {
          msgs.push('Hồ sơ do phần mềm Fast quản lý — không cập nhật qua import');
        }
      }
      if (parsed.success && parsed.data.idNumber) {
        const h = this.encryption.blindIndex(parsed.data.idNumber)!;
        if (seenIds.has(h)) msgs.push('Trùng số CCCD với dòng khác trong file');
        seenIds.add(h);
        const owner = idHashOwner.get(h);
        if (owner && owner !== code) msgs.push(`Số CCCD đã có ở hồ sơ ${owner}`);
      }

      if (parsed.success && parsed.data.attendanceCode) {
        const ac = parsed.data.attendanceCode;
        if (seenAttendance.has(ac)) msgs.push('Trùng mã chấm công với dòng khác trong file');
        seenAttendance.add(ac);
        const owner = attendanceOwner.get(ac);
        if (owner && owner !== code) msgs.push(`Mã chấm công đã gắn cho hồ sơ ${owner}`);
      }

      if (msgs.length || !parsed.success) errors.push({ row: rowNumber, code, messages: msgs });
      else valid.push({ input: parsed.data, existingId: ex?.id ?? null });
    }

    const result: ImportResult = {
      total: rows.length,
      valid: valid.length,
      toCreate: valid.filter((v) => !v.existingId).length,
      toUpdate: valid.filter((v) => v.existingId).length,
      errors: errors.slice(0, 500),
      committed: false,
    };
    if (!commit || errors.length || !valid.length) return result;

    await this.prisma.$transaction(
      async (tx) => {
        for (const { input, existingId } of valid) {
          const { idNumber, taxCode, bankAccountNo, code, ...plain } = input;
          const data = {
            ...plain,
            searchText: normalizeSearch([code, input.fullName, input.phone, input.email].filter(Boolean).join(' ')),
            ...(idNumber !== null && idNumber !== undefined
              ? { idNumberEnc: this.encryption.encrypt(idNumber), idNumberHash: this.encryption.blindIndex(idNumber) }
              : {}),
            ...(taxCode ? { taxCodeEnc: this.encryption.encrypt(taxCode) } : {}),
            ...(bankAccountNo ? { bankAccountEnc: this.encryption.encrypt(bankAccountNo) } : {}),
            updatedBy: actor.id,
          };
          if (existingId) {
            // Import không xóa thông tin đã có: bỏ các ô trống
            const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
            await tx.employee.update({ where: { id: existingId }, data: patch });
          } else {
            await tx.employee.create({ data: { ...data, code, campusId: input.campusId, unitId: input.unitId, createdBy: actor.id } });
          }
        }
        await this.audit.log(
          { actor, action: 'IMPORT', entity: 'employee', after: { total: valid.length, created: result.toCreate, updated: result.toUpdate }, meta },
          tx,
        );
      },
      { timeout: 300_000 },
    );
    return { ...result, committed: true };
  }
}
