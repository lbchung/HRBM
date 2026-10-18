import type { ComponentKind } from '@bachmai/shared';

/** Số tiền dạng 1.234.567 (đồng, không phần lẻ) */
export const money = (v?: string | number | null) =>
  v === null || v === undefined || v === '' ? '—' : Math.round(Number(v)).toLocaleString('vi-VN');

export const monthLabel = (m?: string | null) => (m ? m.split('-').reverse().join('/') : '—');

export type RunStatus = 'DRAFT' | 'CALCULATING' | 'CALCULATED' | 'CLOSED';
export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: 'default' },
  CALCULATING: { label: 'Đang tính', color: 'processing' },
  CALCULATED: { label: 'Đã tính', color: 'blue' },
  CLOSED: { label: 'Đã chốt', color: 'success' },
};

export interface PayrollRun {
  id: string;
  code: string;
  month: string;
  name: string;
  note: string | null;
  status: RunStatus;
  progress: number;
  employeeCount: number;
  errorCount: number;
  totals: { gross: string; deductions: string; net: string; employerCost: string } | null;
  calculatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface PayslipLine {
  id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  taxable: boolean;
  amount: string;
  hidden?: boolean;
}

export interface PayslipDetail {
  id: string;
  gross: string;
  taxable: string;
  deductions: string;
  employerCost: string;
  net: string;
  errors: string[] | null;
  inputs: Record<string, string>;
  timesheetClosed: boolean;
  run: PayrollRun;
  lines: PayslipLine[];
  employee: { id: string; code: string; fullName: string; unit: { name: string }; campus: { name: string } };
}

export type RaiseKind = 'REGULAR' | 'EARLY' | 'BEYOND_SCALE';
export const RAISE_KINDS: Record<RaiseKind, string> = {
  REGULAR: 'Nâng bậc thường xuyên',
  EARLY: 'Nâng bậc trước hạn',
  BEYOND_SCALE: 'Thâm niên vượt khung',
};

export type ExtraIncomeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PAID';
export const EXTRA_STATUS: Record<ExtraIncomeStatus, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'processing' },
  APPROVED: { label: 'Đã duyệt', color: 'blue' },
  REJECTED: { label: 'Từ chối', color: 'error' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
  PAID: { label: 'Đã chi', color: 'success' },
};
