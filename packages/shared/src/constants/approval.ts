/** Loại đối tượng được duyệt qua quy trình. Module nghiệp vụ đăng ký thêm khi cần. */
export const APPROVAL_TARGET_TYPES = {
  GENERAL: 'Tờ trình / đề xuất chung',
  LEAVE_REQUEST: 'Phiếu nghỉ, công tác, học tập',
  EXTRA_INCOME: 'Đề xuất thu nhập tăng thêm',
} as const;
export type ApprovalTargetType = keyof typeof APPROVAL_TARGET_TYPES;

export const APPROVER_TYPES = {
  SELECTED: 'Người tạo phiếu chọn tài khoản duyệt',
  UNIT_MANAGER: 'Người phụ trách đơn vị của phiếu',
  ROLE: 'Tài khoản thuộc nhóm (theo phạm vi dữ liệu của nhóm)',
} as const;
export type ApproverType = keyof typeof APPROVER_TYPES;

export const APPROVAL_STATUS_LABELS = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
} as const;
export type ApprovalStatus = keyof typeof APPROVAL_STATUS_LABELS;

export type ApprovalDecision = 'APPROVE' | 'REJECT';

export interface ApprovalStepSnapshot {
  stepOrder: number;
  name: string;
  approverType: ApproverType;
  roleId: string | null;
}

/**
 * Máy trạng thái duyệt — hàm thuần, dễ test.
 * Duyệt bước cuối → APPROVED; từ chối ở bất kỳ bước nào → REJECTED.
 */
export function nextApprovalState(
  steps: ApprovalStepSnapshot[],
  currentStep: number,
  decision: ApprovalDecision,
): { status: ApprovalStatus; currentStep: number } {
  if (decision === 'REJECT') return { status: 'REJECTED', currentStep };
  const orders = steps.map((s) => s.stepOrder).sort((a, b) => a - b);
  const next = orders.find((o) => o > currentStep);
  return next === undefined ? { status: 'APPROVED', currentStep } : { status: 'PENDING', currentStep: next };
}
