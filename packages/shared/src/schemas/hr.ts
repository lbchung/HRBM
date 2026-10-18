import { z } from 'zod';
import { EMPLOYEE_STATUSES, GENDERS, MARITAL_STATUSES, SALARY_FORMS } from '../constants/hr';
import {
  catalogCodeSchema,
  dateOnlySchema,
  decimalSchema,
  nullableCatalogCode,
  nullableDate,
  nullableDecimal,
  nullableText,
  nullableUuid,
  paginationSchema,
  uuidSchema,
} from './common';

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const emptyToNull = z.literal('').transform(() => null);
const patterned = (re: RegExp, message: string) =>
  z.union([z.string().trim().regex(re, message), emptyToNull, z.null()]).optional();

export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

// '' phải đứng trước coerce (Number('') = 0)
const nullableInt = z.union([emptyToNull, z.null(), z.coerce.number().int()]).optional();

// ======================= HỒ SƠ NHÂN VIÊN =======================

export const employeeCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Nhập mã nhân viên')
  .max(30)
  .regex(/^[A-Z0-9_.-]+$/, 'Mã chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch');

export const employeeBaseSchema = z.object({
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(200),
  gender: z.enum(keys(GENDERS)),
  dateOfBirth: nullableDate,
  placeOfBirth: nullableText(300),
  hometown: nullableText(300),
  nationality: nullableText(100),
  ethnicityCode: nullableCatalogCode,
  religionCode: nullableCatalogCode,
  idNumber: patterned(/^(\d{9}|\d{12})$/, 'CCCD 12 số hoặc CMND 9 số'),
  idIssueDate: nullableDate,
  idIssuePlace: nullableText(200),
  taxCode: patterned(/^\d{10}(-\d{3})?$/, 'Mã số thuế 10 số (hoặc 10 số-3 số)'),
  socialInsuranceNo: nullableText(20),
  healthInsuranceNo: nullableText(20),
  bankAccountNo: patterned(/^[0-9]{4,30}$/, 'Số tài khoản chỉ gồm chữ số'),
  bankCode: nullableCatalogCode,
  bankBranch: nullableText(200),
  phone: nullableText(20),
  email: z.union([z.string().trim().email('Email không hợp lệ'), emptyToNull, z.null()]).optional(),
  permanentAddress: nullableText(500),
  currentAddress: nullableText(500),
  maritalStatus: z.union([z.enum(keys(MARITAL_STATUSES)), emptyToNull, z.null()]).optional(),
  photoFileId: nullableUuid,
  campusId: uuidSchema,
  unitId: uuidSchema,
  positionCode: nullableCatalogCode,
  jobTitleCode: nullableCatalogCode,
  contractTypeCode: nullableCatalogCode,
  educationLevelCode: nullableCatalogCode,
  academicTitleCode: nullableCatalogCode,
  specialty: nullableText(200),
  /** Mã chấm công = employeeNo trên máy Face ID */
  attendanceCode: patterned(/^[A-Za-z0-9_-]{1,50}$/, 'Mã chấm công chỉ gồm chữ, số, gạch'),
  startDate: nullableDate,
  recruitmentDate: nullableDate,
  partyJoinDate: nullableDate,
  status: z.enum(keys(EMPLOYEE_STATUSES)).optional(),
  leaveDate: nullableDate,
  leaveReason: nullableText(500),
  note: nullableText(2000),
});

export const createEmployeeSchema = employeeBaseSchema.extend({ code: employeeCodeSchema });
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = employeeBaseSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationSchema.extend({
  campusId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  /** Gồm cả đơn vị con của unitId */
  includeSubUnits: queryBool,
  /** ACTIVE = đang làm việc + thử việc + nghỉ dài hạn */
  status: z.enum(['ACTIVE', 'ALL', ...Object.keys(EMPLOYEE_STATUSES)] as [string, ...string[]]).default('ACTIVE'),
  gender: z.enum(keys(GENDERS)).optional(),
  positionCode: z.string().max(50).optional(),
  jobTitleCode: z.string().max(50).optional(),
  contractTypeCode: z.string().max(50).optional(),
  hasAccount: queryBool,
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

// ======================= HỒ SƠ CON =======================

const familyBase = z.object({
  relationshipCode: catalogCodeSchema,
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(200),
  birthYear: nullableInt,
  occupation: nullableText(200),
  workplace: nullableText(300),
  phone: nullableText(20),
  isDependant: z.boolean().default(false),
  dependantTaxCode: nullableText(20),
  deductionFrom: nullableDate,
  deductionTo: nullableDate,
  note: nullableText(1000),
});

const workHistoryBase = z.object({
  eventTypeCode: catalogCodeSchema,
  decisionNo: nullableText(100),
  decisionDate: nullableDate,
  effectiveDate: dateOnlySchema,
  fromUnitId: nullableUuid,
  toUnitId: nullableUuid,
  positionCode: nullableCatalogCode,
  jobTitleCode: nullableCatalogCode,
  content: nullableText(2000),
});

const contractBase = z.object({
  contractNo: nullableText(100),
  contractTypeCode: catalogCodeSchema,
  signDate: nullableDate,
  startDate: dateOnlySchema,
  endDate: nullableDate,
  salaryForm: z.enum(keys(SALARY_FORMS)).default('COEFFICIENT'),
  fileId: nullableUuid,
  note: nullableText(1000),
});

const assignmentBase = z.object({
  campusId: uuidSchema,
  unitId: nullableUuid,
  fromDate: dateOnlySchema,
  toDate: dateOnlySchema,
  decisionNo: nullableText(100),
  note: nullableText(1000),
});

const documentBase = z.object({
  fileId: uuidSchema,
  categoryCode: catalogCodeSchema,
  name: z.string().trim().min(1, 'Nhập tên tài liệu').max(300),
  note: nullableText(1000),
});

const trainingBase = z.object({
  trainingTypeCode: catalogCodeSchema,
  name: z.string().trim().min(1, 'Nhập tên khóa học / văn bằng').max(300),
  institution: nullableText(300),
  major: nullableText(200),
  fromDate: nullableDate,
  toDate: nullableDate,
  certificateNo: nullableText(100),
  issueDate: nullableDate,
  expiryDate: nullableDate,
  hours: nullableDecimal,
  result: nullableText(200),
  fileId: nullableUuid,
  note: nullableText(1000),
});

const rewardBase = z.object({
  formCode: catalogCodeSchema,
  levelCode: nullableCatalogCode,
  year: z.coerce.number().int().min(1950).max(2100),
  decisionNo: nullableText(100),
  decisionDate: nullableDate,
  content: nullableText(2000),
  amount: nullableDecimal,
});

const disciplineBase = z.object({
  formCode: catalogCodeSchema,
  decisionNo: nullableText(100),
  decisionDate: nullableDate,
  effectiveFrom: dateOnlySchema,
  effectiveTo: nullableDate,
  reason: nullableText(2000),
  delayRaiseMonths: z.coerce.number().int().min(0).max(120).default(0),
});

const salaryBase = z.object({
  effectiveFrom: dateOnlySchema,
  salaryForm: z.enum(keys(SALARY_FORMS)),
  scaleCode: nullableCatalogCode,
  step: nullableInt,
  coefficient: nullableDecimal,
  beyondScalePercent: nullableDecimal,
  fixedAmount: nullableDecimal,
  nextRaiseDate: nullableDate,
  decisionNo: nullableText(100),
  decisionDate: nullableDate,
  note: nullableText(1000),
});

const allowanceBase = z.object({
  allowanceTypeCode: catalogCodeSchema,
  value: decimalSchema,
  effectiveFrom: dateOnlySchema,
  effectiveTo: nullableDate,
  decisionNo: nullableText(100),
  note: nullableText(1000),
});

const incomeCoefficientBase = z.object({
  effectiveFrom: dateOnlySchema,
  stabilizationCoef: decimalSchema.default('0'),
  managementCoef: decimalSchema.default('0'),
  otherCoef: decimalSchema.default('0'),
  note: nullableText(1000),
});

/** Ràng buộc liên trường — dùng cho cả tạo mới và bản ghi đã gộp khi cập nhật. */
export const SUB_RECORD_RULES: Record<string, ((r: Record<string, unknown>) => string | null)[]> = {
  contracts: [(r) => (r.endDate && r.startDate && r.endDate < r.startDate ? 'Ngày kết thúc phải sau ngày bắt đầu' : null)],
  assignments: [(r) => (r.toDate && r.fromDate && r.toDate < r.fromDate ? 'Đến ngày phải sau từ ngày' : null)],
  disciplines: [(r) => (r.effectiveTo && r.effectiveFrom && r.effectiveTo < r.effectiveFrom ? 'Ngày hết hiệu lực phải sau ngày hiệu lực' : null)],
  allowances: [(r) => (r.effectiveTo && r.effectiveFrom && r.effectiveTo < r.effectiveFrom ? 'Ngày hết hiệu lực phải sau ngày hiệu lực' : null)],
  family: [(r) => (r.deductionTo && r.deductionFrom && r.deductionTo < r.deductionFrom ? 'Thời gian giảm trừ không hợp lệ' : null)],
  salaries: [
    (r) => (r.salaryForm === 'COEFFICIENT' && !r.coefficient ? 'Nhập hệ số lương' : null),
    (r) => (r.salaryForm === 'FIXED' && !r.fixedAmount ? 'Nhập mức lương khoán' : null),
  ],
};

export const EMPLOYEE_SUB_RESOURCE_SCHEMAS = {
  family: familyBase,
  'work-history': workHistoryBase.extend({ applyToProfile: z.boolean().optional() }),
  contracts: contractBase,
  assignments: assignmentBase,
  documents: documentBase,
  trainings: trainingBase,
  rewards: rewardBase,
  disciplines: disciplineBase,
  salaries: salaryBase,
  allowances: allowanceBase,
  'income-coefficients': incomeCoefficientBase,
} as const;
export type EmployeeSubResource = keyof typeof EMPLOYEE_SUB_RESOURCE_SCHEMAS;
export const EMPLOYEE_SUB_RESOURCES = Object.keys(EMPLOYEE_SUB_RESOURCE_SCHEMAS) as EmployeeSubResource[];

/** Phân công nhiều nhân viên cùng lúc */
export const bulkAssignmentSchema = assignmentBase.extend({
  employeeIds: z.array(uuidSchema).min(1, 'Chọn nhân viên').max(500),
});
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>;

export const listAssignmentsQuerySchema = paginationSchema.extend({
  campusId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  /** YYYY-MM — phân công có giao với tháng này */
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

export const hrReportQuerySchema = paginationSchema.extend({
  campusId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
  typeCode: z.string().max(50).optional(),
  year: z.coerce.number().int().optional(),
  /** Chỉ chứng chỉ hết hạn trong N ngày tới (đào tạo) */
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  export: z.enum(['xlsx']).optional(),
});
export type HrReportQuery = z.infer<typeof hrReportQuerySchema>;
