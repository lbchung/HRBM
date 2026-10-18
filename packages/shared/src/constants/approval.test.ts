import { describe, expect, it } from 'vitest';
import { nextApprovalState, type ApprovalStepSnapshot } from './approval';

const steps: ApprovalStepSnapshot[] = [
  { stepOrder: 1, name: 'Trưởng khoa', approverType: 'UNIT_MANAGER', roleId: null },
  { stepOrder: 2, name: 'TCCB', approverType: 'ROLE', roleId: 'r1' },
];

describe('nextApprovalState', () => {
  it('duyệt bước 1 → chuyển bước 2', () => {
    expect(nextApprovalState(steps, 1, 'APPROVE')).toEqual({ status: 'PENDING', currentStep: 2 });
  });
  it('duyệt bước cuối → APPROVED', () => {
    expect(nextApprovalState(steps, 2, 'APPROVE')).toEqual({ status: 'APPROVED', currentStep: 2 });
  });
  it('từ chối → REJECTED, giữ nguyên bước', () => {
    expect(nextApprovalState(steps, 1, 'REJECT')).toEqual({ status: 'REJECTED', currentStep: 1 });
  });
  it('quy trình 1 bước', () => {
    expect(nextApprovalState([steps[0]], 1, 'APPROVE').status).toBe('APPROVED');
  });
  it('thứ tự bước không liên tục (1, 5)', () => {
    const s = [steps[0], { ...steps[1], stepOrder: 5 }];
    expect(nextApprovalState(s, 1, 'APPROVE')).toEqual({ status: 'PENDING', currentStep: 5 });
  });
});
