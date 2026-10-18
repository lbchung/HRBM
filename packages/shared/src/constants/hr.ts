export const GENDERS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' } as const;
export type Gender = keyof typeof GENDERS;

export const EMPLOYEE_STATUSES = {
  WORKING: 'Đang làm việc',
  PROBATION: 'Thử việc',
  LONG_LEAVE: 'Nghỉ dài hạn',
  RESIGNED: 'Đã nghỉ việc',
  RETIRED: 'Đã nghỉ hưu',
} as const;
export type EmployeeStatus = keyof typeof EMPLOYEE_STATUSES;
/** Trạng thái còn thuộc biên chế / đang tính công, lương */
export const ACTIVE_EMPLOYEE_STATUSES: EmployeeStatus[] = ['WORKING', 'PROBATION', 'LONG_LEAVE'];

export const MARITAL_STATUSES = {
  SINGLE: 'Độc thân',
  MARRIED: 'Đã kết hôn',
  DIVORCED: 'Ly hôn',
  WIDOWED: 'Góa',
} as const;
export type MaritalStatus = keyof typeof MARITAL_STATUSES;

export const SALARY_FORMS = { COEFFICIENT: 'Lương theo hệ số', FIXED: 'Lương khoán tiền đồng' } as const;
export type SalaryForm = keyof typeof SALARY_FORMS;

export const RECORD_SOURCES = { LOCAL: 'Hệ thống mới', FAST: 'Phần mềm Fast' } as const;
export type RecordSource = keyof typeof RECORD_SOURCES;

/** Loại dữ liệu có thể cấu hình nguồn chuẩn (Fast hay hệ thống mới). */
export const INTEGRATION_ENTITIES = {
  'org.unit': 'Danh mục đơn vị',
  'hr.employee': 'Hồ sơ nhân viên (thông tin chung)',
  'hr.contract': 'Hợp đồng',
  'hr.work_history': 'Quá trình công tác',
  'hr.salary': 'Thông tin lương, phụ cấp',
} as const;
export type IntegrationEntity = keyof typeof INTEGRATION_ENTITIES;
