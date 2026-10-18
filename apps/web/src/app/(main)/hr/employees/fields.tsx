import { Tag } from 'antd';
import { EMPLOYEE_STATUSES, GENDERS, MARITAL_STATUSES, SALARY_FORMS } from '@bachmai/shared';
import type { FieldDef } from '@/components/FormFields';
import { formatDay } from '@/lib/format';

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export const STATUS_COLOR: Record<string, string> = {
  WORKING: 'green',
  PROBATION: 'blue',
  LONG_LEAVE: 'gold',
  RESIGNED: 'default',
  RETIRED: 'purple',
};

// ======================= HỒ SƠ CHÍNH (theo nhóm) =======================

export const EMPLOYEE_SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Thông tin cá nhân',
    fields: [
      { name: 'code', label: 'Mã nhân viên', type: 'text', required: true, lockOnEdit: true, span: 8 },
      { name: 'fullName', label: 'Họ và tên', type: 'text', required: true, span: 10 },
      { name: 'gender', label: 'Giới tính', type: 'select', options: opts(GENDERS), required: true, span: 6 },
      { name: 'dateOfBirth', label: 'Ngày sinh', type: 'date', span: 8 },
      { name: 'placeOfBirth', label: 'Nơi sinh', type: 'text', span: 8 },
      { name: 'hometown', label: 'Quê quán', type: 'text', span: 8 },
      { name: 'ethnicityCode', label: 'Dân tộc', type: 'catalog', catalog: 'ETHNICITY', span: 8 },
      { name: 'religionCode', label: 'Tôn giáo', type: 'catalog', catalog: 'RELIGION', span: 8 },
      { name: 'nationality', label: 'Quốc tịch', type: 'text', span: 8 },
      { name: 'maritalStatus', label: 'Tình trạng hôn nhân', type: 'select', options: opts(MARITAL_STATUSES), span: 8 },
      { name: 'partyJoinDate', label: 'Ngày vào Đảng', type: 'date', span: 8 },
      { name: 'photoFileId', label: 'Ảnh hồ sơ', type: 'file', span: 8 },
    ],
  },
  {
    title: 'Giấy tờ, bảo hiểm',
    fields: [
      { name: 'idNumber', label: 'Số CCCD', type: 'text', span: 8, help: 'Được mã hóa khi lưu' },
      { name: 'idIssueDate', label: 'Ngày cấp', type: 'date', span: 8 },
      { name: 'idIssuePlace', label: 'Nơi cấp', type: 'text', span: 8 },
      { name: 'taxCode', label: 'Mã số thuế cá nhân', type: 'text', span: 8 },
      { name: 'socialInsuranceNo', label: 'Số sổ BHXH', type: 'text', span: 8 },
      { name: 'healthInsuranceNo', label: 'Số thẻ BHYT', type: 'text', span: 8 },
    ],
  },
  {
    title: 'Liên hệ',
    fields: [
      { name: 'phone', label: 'Điện thoại', type: 'text', span: 8 },
      { name: 'email', label: 'Email', type: 'text', span: 16 },
      { name: 'permanentAddress', label: 'Địa chỉ thường trú', type: 'text', span: 12 },
      { name: 'currentAddress', label: 'Địa chỉ hiện tại', type: 'text', span: 12 },
    ],
  },
  {
    title: 'Công tác',
    fields: [
      { name: 'campusId', label: 'Cơ sở gốc', type: 'campus', required: true, span: 8 },
      { name: 'unitId', label: 'Đơn vị', type: 'unit', required: true, span: 16 },
      { name: 'positionCode', label: 'Chức vụ', type: 'catalog', catalog: 'POSITION', span: 8 },
      { name: 'jobTitleCode', label: 'Chức danh nghề nghiệp', type: 'catalog', catalog: 'JOB_TITLE', span: 8 },
      { name: 'contractTypeCode', label: 'Loại hợp đồng / đối tượng', type: 'catalog', catalog: 'CONTRACT_TYPE', span: 8 },
      { name: 'educationLevelCode', label: 'Trình độ chuyên môn', type: 'catalog', catalog: 'EDUCATION_LEVEL', span: 8 },
      { name: 'academicTitleCode', label: 'Học hàm', type: 'catalog', catalog: 'ACADEMIC_TITLE', span: 8 },
      { name: 'specialty', label: 'Chuyên ngành', type: 'text', span: 8 },
      { name: 'attendanceCode', label: 'Mã chấm công (Face ID)', type: 'text', span: 8, help: 'Trùng với mã nhân viên khai báo trên máy chấm công' },
      { name: 'startDate', label: 'Ngày vào làm tại bệnh viện', type: 'date', span: 8 },
      { name: 'recruitmentDate', label: 'Ngày tuyển dụng', type: 'date', span: 8 },
      { name: 'status', label: 'Trạng thái', type: 'select', options: opts(EMPLOYEE_STATUSES), span: 8 },
      { name: 'leaveDate', label: 'Ngày nghỉ việc / nghỉ hưu', type: 'date', span: 8 },
      { name: 'leaveReason', label: 'Lý do nghỉ', type: 'text', span: 16 },
    ],
  },
  {
    title: 'Ngân hàng',
    fields: [
      { name: 'bankAccountNo', label: 'Số tài khoản', type: 'text', span: 8, help: 'Được mã hóa khi lưu' },
      { name: 'bankCode', label: 'Ngân hàng', type: 'catalog', catalog: 'BANK', span: 8 },
      { name: 'bankBranch', label: 'Chi nhánh', type: 'text', span: 8 },
    ],
  },
  {
    title: 'Ghi chú',
    fields: [{ name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 }],
  },
];

export const EMPLOYEE_FIELDS = EMPLOYEE_SECTIONS.flatMap((s) => s.fields);

// ======================= HỒ SƠ CON =======================

const decision: FieldDef[] = [
  { name: 'decisionNo', label: 'Số quyết định', type: 'text', span: 12, table: true },
  { name: 'decisionDate', label: 'Ngày quyết định', type: 'date', span: 12 },
];

export const SUB_FIELDS: Record<string, FieldDef[]> = {
  family: [
    { name: 'relationshipCode', label: 'Quan hệ', type: 'catalog', catalog: 'RELATIONSHIP', required: true, span: 8, table: true },
    { name: 'fullName', label: 'Họ và tên', type: 'text', required: true, span: 10, table: true },
    { name: 'birthYear', label: 'Năm sinh', type: 'number', span: 6, table: true },
    { name: 'occupation', label: 'Nghề nghiệp', type: 'text', span: 12, table: true },
    { name: 'workplace', label: 'Nơi công tác / học tập', type: 'text', span: 12 },
    { name: 'phone', label: 'Điện thoại', type: 'text', span: 12 },
    { name: 'isDependant', label: 'Người phụ thuộc (giảm trừ thuế)', type: 'switch', span: 12, table: true },
    { name: 'dependantTaxCode', label: 'MST người phụ thuộc', type: 'text', span: 8 },
    { name: 'deductionFrom', label: 'Giảm trừ từ', type: 'date', span: 8, table: true },
    { name: 'deductionTo', label: 'Giảm trừ đến', type: 'date', span: 8, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 },
  ],
  'work-history': [
    { name: 'effectiveDate', label: 'Ngày hiệu lực', type: 'date', required: true, span: 8, table: true },
    { name: 'eventTypeCode', label: 'Loại', type: 'catalog', catalog: 'WORK_EVENT_TYPE', required: true, span: 16, table: true },
    { name: 'fromUnitId', label: 'Từ đơn vị', type: 'unit', span: 12, table: true, render: (r) => r.fromUnit?.name ?? '—' },
    { name: 'toUnitId', label: 'Đến đơn vị', type: 'unit', span: 12, table: true, render: (r) => r.toUnit?.name ?? '—' },
    { name: 'positionCode', label: 'Chức vụ', type: 'catalog', catalog: 'POSITION', span: 12, table: true },
    { name: 'jobTitleCode', label: 'Chức danh nghề nghiệp', type: 'catalog', catalog: 'JOB_TITLE', span: 12 },
    ...decision,
    { name: 'content', label: 'Nội dung', type: 'textarea', span: 24, table: true },
    {
      name: 'applyToProfile',
      label: 'Cập nhật đơn vị / chức vụ / chức danh hiện tại của hồ sơ theo quá trình này',
      type: 'switch',
      span: 24,
      formOnly: true,
    },
  ],
  contracts: [
    { name: 'contractNo', label: 'Số hợp đồng', type: 'text', span: 8, table: true },
    { name: 'contractTypeCode', label: 'Loại hợp đồng', type: 'catalog', catalog: 'CONTRACT_TYPE', required: true, span: 16, table: true },
    { name: 'signDate', label: 'Ngày ký', type: 'date', span: 8 },
    { name: 'startDate', label: 'Từ ngày', type: 'date', required: true, span: 8, table: true },
    { name: 'endDate', label: 'Đến ngày', type: 'date', span: 8, table: true, help: 'Bỏ trống nếu không xác định thời hạn' },
    { name: 'salaryForm', label: 'Hình thức lương', type: 'select', options: opts(SALARY_FORMS), required: true, span: 12, table: true },
    { name: 'fileId', label: 'File hợp đồng', type: 'file', span: 12, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 },
  ],
  assignments: [
    { name: 'campusId', label: 'Cơ sở làm việc', type: 'campus', required: true, span: 12, table: true, render: (r) => r.campus?.name ?? '—' },
    { name: 'unitId', label: 'Đơn vị làm việc', type: 'unit', span: 12, table: true, render: (r) => r.unit?.name ?? '—' },
    { name: 'fromDate', label: 'Từ ngày', type: 'date', required: true, span: 8, table: true },
    { name: 'toDate', label: 'Đến ngày', type: 'date', required: true, span: 8, table: true },
    { name: 'decisionNo', label: 'Số quyết định', type: 'text', span: 8, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24, table: true },
  ],
  documents: [
    { name: 'categoryCode', label: 'Loại tài liệu', type: 'catalog', catalog: 'DOCUMENT_TYPE', required: true, span: 12, table: true },
    { name: 'name', label: 'Tên tài liệu', type: 'text', required: true, span: 12, table: true },
    { name: 'fileId', label: 'File', type: 'file', required: true, span: 24, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24, table: true },
    { name: 'createdAt', label: 'Ngày tải lên', type: 'date', tableOnly: true, table: true, render: (r) => formatDay(r.createdAt) },
  ],
  trainings: [
    { name: 'trainingTypeCode', label: 'Loại đào tạo', type: 'catalog', catalog: 'TRAINING_TYPE', required: true, span: 12, table: true },
    { name: 'name', label: 'Khóa học / văn bằng / chứng chỉ', type: 'text', required: true, span: 12, table: true },
    { name: 'institution', label: 'Cơ sở đào tạo', type: 'text', span: 12, table: true },
    { name: 'major', label: 'Chuyên ngành', type: 'text', span: 12 },
    { name: 'fromDate', label: 'Từ ngày', type: 'date', span: 8, table: true },
    { name: 'toDate', label: 'Đến ngày', type: 'date', span: 8, table: true },
    { name: 'hours', label: 'Số giờ / tiết', type: 'decimal', span: 8 },
    { name: 'certificateNo', label: 'Số hiệu văn bằng', type: 'text', span: 8 },
    { name: 'issueDate', label: 'Ngày cấp', type: 'date', span: 8 },
    { name: 'expiryDate', label: 'Ngày hết hạn', type: 'date', span: 8, table: true },
    { name: 'result', label: 'Kết quả / xếp loại', type: 'text', span: 12 },
    { name: 'fileId', label: 'File văn bằng', type: 'file', span: 12, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 },
  ],
  rewards: [
    { name: 'year', label: 'Năm', type: 'number', required: true, span: 6, table: true },
    { name: 'formCode', label: 'Hình thức', type: 'catalog', catalog: 'REWARD_FORM', required: true, span: 10, table: true },
    { name: 'levelCode', label: 'Cấp khen thưởng', type: 'catalog', catalog: 'REWARD_LEVEL', span: 8, table: true },
    ...decision,
    { name: 'amount', label: 'Số tiền thưởng', type: 'decimal', span: 12, table: true },
    { name: 'content', label: 'Nội dung', type: 'textarea', span: 24, table: true },
  ],
  disciplines: [
    { name: 'formCode', label: 'Hình thức kỷ luật', type: 'catalog', catalog: 'DISCIPLINE_FORM', required: true, span: 12, table: true },
    { name: 'delayRaiseMonths', label: 'Kéo dài nâng lương (tháng)', type: 'number', span: 12, table: true },
    { name: 'effectiveFrom', label: 'Hiệu lực từ', type: 'date', required: true, span: 12, table: true },
    { name: 'effectiveTo', label: 'Hiệu lực đến', type: 'date', span: 12, table: true },
    ...decision,
    { name: 'reason', label: 'Lý do', type: 'textarea', span: 24, table: true },
  ],
  salaries: [
    { name: 'effectiveFrom', label: 'Ngày hưởng', type: 'date', required: true, span: 8, table: true },
    { name: 'salaryForm', label: 'Hình thức', type: 'select', options: opts(SALARY_FORMS), required: true, span: 8, table: true },
    { name: 'scaleCode', label: 'Ngạch / chức danh', type: 'catalog', catalog: 'JOB_TITLE', span: 8, table: true },
    { name: 'step', label: 'Bậc', type: 'number', span: 6, table: true },
    { name: 'coefficient', label: 'Hệ số lương', type: 'decimal', span: 6, table: true },
    { name: 'beyondScalePercent', label: '% vượt khung', type: 'decimal', span: 6, table: true },
    { name: 'fixedAmount', label: 'Lương khoán (đồng)', type: 'decimal', span: 6, table: true },
    { name: 'nextRaiseDate', label: 'Mốc nâng lương lần sau', type: 'date', span: 8, table: true },
    { name: 'decisionNo', label: 'Số quyết định', type: 'text', span: 8, table: true },
    { name: 'decisionDate', label: 'Ngày quyết định', type: 'date', span: 8 },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 },
  ],
  allowances: [
    { name: 'allowanceTypeCode', label: 'Loại phụ cấp', type: 'catalog', catalog: 'ALLOWANCE_TYPE', required: true, span: 12, table: true },
    { name: 'value', label: 'Mức (hệ số / % / số tiền)', type: 'decimal', required: true, span: 12, table: true },
    { name: 'effectiveFrom', label: 'Từ ngày', type: 'date', required: true, span: 8, table: true },
    { name: 'effectiveTo', label: 'Đến ngày', type: 'date', span: 8, table: true },
    { name: 'decisionNo', label: 'Số quyết định', type: 'text', span: 8, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24 },
  ],
  'income-coefficients': [
    { name: 'effectiveFrom', label: 'Từ ngày', type: 'date', required: true, span: 6, table: true },
    { name: 'stabilizationCoef', label: 'Hệ số ổn định', type: 'decimal', span: 6, table: true },
    { name: 'managementCoef', label: 'Hệ số quản lý', type: 'decimal', span: 6, table: true },
    { name: 'otherCoef', label: 'Hệ số khác', type: 'decimal', span: 6, table: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', span: 24, table: true },
  ],
};

export function StatusTag({ status }: { status: string }) {
  return <Tag color={STATUS_COLOR[status]}>{EMPLOYEE_STATUSES[status as keyof typeof EMPLOYEE_STATUSES] ?? status}</Tag>;
}
