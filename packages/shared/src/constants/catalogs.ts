/**
 * Danh mục dùng chung (bảng `catalog_items`). Thêm loại danh mục mới chỉ cần khai báo ở đây.
 * Bản ghi nghiệp vụ tham chiếu danh mục bằng MÃ (code) — mã không đổi sau khi tạo.
 */
export interface CatalogMetaField {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
}

export interface CatalogTypeDef {
  label: string;
  group: string;
  description?: string;
  metaFields?: CatalogMetaField[];
}

export const JOB_TITLE_GROUPS = [
  { value: 'BAC_SI', label: 'Bác sĩ' },
  { value: 'DIEU_DUONG', label: 'Điều dưỡng' },
  { value: 'HO_SINH', label: 'Hộ sinh' },
  { value: 'KY_THUAT_Y', label: 'Kỹ thuật y' },
  { value: 'DUOC', label: 'Dược' },
  { value: 'CHUYEN_MON_KHAC', label: 'Chuyên môn khác' },
  { value: 'HANH_CHINH', label: 'Hành chính, quản lý' },
  { value: 'PHUC_VU', label: 'Hỗ trợ, phục vụ' },
];

export const ALLOWANCE_CALC_METHODS = [
  { value: 'COEFFICIENT', label: 'Theo hệ số × lương cơ sở' },
  { value: 'PERCENT', label: 'Theo % lương' },
  { value: 'AMOUNT', label: 'Số tiền cố định' },
];

export const CATALOG_TYPES = {
  POSITION: { label: 'Chức vụ', group: 'Tổ chức' },
  JOB_TITLE: {
    label: 'Chức danh nghề nghiệp',
    group: 'Tổ chức',
    description: 'Mã chức danh nghề nghiệp / ngạch (vd: V.08.01.03)',
    metaFields: [{ key: 'group', label: 'Nhóm chức danh', type: 'select', options: JOB_TITLE_GROUPS }],
  },
  CONTRACT_TYPE: {
    label: 'Loại hợp đồng / đối tượng',
    group: 'Nhân sự',
    metaFields: [
      {
        key: 'salaryForm',
        label: 'Hình thức lương mặc định',
        type: 'select',
        options: [
          { value: 'COEFFICIENT', label: 'Theo hệ số' },
          { value: 'FIXED', label: 'Khoán tiền đồng' },
        ],
      },
    ],
  },
  WORK_EVENT_TYPE: { label: 'Loại quá trình công tác', group: 'Nhân sự' },
  ETHNICITY: { label: 'Dân tộc', group: 'Nhân sự' },
  RELIGION: { label: 'Tôn giáo', group: 'Nhân sự' },
  EDUCATION_LEVEL: { label: 'Trình độ chuyên môn', group: 'Nhân sự' },
  ACADEMIC_TITLE: { label: 'Học hàm', group: 'Nhân sự' },
  RELATIONSHIP: { label: 'Quan hệ gia đình', group: 'Nhân sự' },
  DOCUMENT_TYPE: { label: 'Loại tài liệu hồ sơ', group: 'Nhân sự' },
  BANK: { label: 'Ngân hàng', group: 'Nhân sự' },
  TRAINING_TYPE: { label: 'Loại đào tạo', group: 'Đào tạo' },
  REWARD_FORM: { label: 'Hình thức khen thưởng', group: 'Thi đua - Khen thưởng' },
  REWARD_LEVEL: { label: 'Cấp khen thưởng', group: 'Thi đua - Khen thưởng' },
  DISCIPLINE_FORM: {
    label: 'Hình thức kỷ luật',
    group: 'Thi đua - Khen thưởng',
    metaFields: [{ key: 'delayRaiseMonths', label: 'Số tháng kéo dài nâng lương', type: 'number' }],
  },
  ALLOWANCE_TYPE: {
    label: 'Loại phụ cấp',
    group: 'Tiền lương',
    metaFields: [{ key: 'calcMethod', label: 'Cách tính', type: 'select', options: ALLOWANCE_CALC_METHODS }],
  },
} satisfies Record<string, CatalogTypeDef>;

export type CatalogType = keyof typeof CATALOG_TYPES;
export const CATALOG_TYPE_CODES = Object.keys(CATALOG_TYPES) as CatalogType[];
