'use client';

import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { ShiftType, TimesheetStatus } from '@bachmai/shared';
import { api } from './api';
import { useMe } from './auth';

export interface Shift {
  id: string;
  code: string;
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
  checkInBeforeMinutes: number;
  checkOutAfterMinutes: number;
  workUnits: string;
  color: string | null;
  campusId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  symbol: string;
  paid: boolean;
  countsAsWork: boolean;
  deductAnnualLeave: boolean;
  requiresAttachment: boolean;
  workflowCode: string;
  maxDaysPerRequest: number | null;
  sortOrder: number;
  isActive: boolean;
}

export const useShifts = (includeInactive = false) =>
  useQuery({
    queryKey: ['shifts', includeInactive],
    queryFn: () => api<Shift[]>('/attendance/shifts', { query: { includeInactive } }),
    staleTime: 5 * 60_000,
  });

export const useLeaveTypes = (includeInactive = false) =>
  useQuery({
    queryKey: ['leave-types', includeInactive],
    queryFn: () => api<LeaveType[]>('/leave/types', { query: { includeInactive } }),
    staleTime: 5 * 60_000,
  });

export const STATUS_COLOR: Record<TimesheetStatus, string> = {
  PRESENT: 'green',
  ABSENT: 'red',
  LEAVE: 'blue',
  LEAVE_HALF: 'cyan',
  HOLIDAY: 'purple',
  MISSING_IN: 'orange',
  MISSING_OUT: 'orange',
  NO_SCHEDULE: 'gold',
};

/** Màu nền ô bảng công theo trạng thái (dùng biến CSS để hợp chế độ tối) */
export const CELL_BG: Record<TimesheetStatus, string> = {
  PRESENT: 'transparent',
  ABSENT: 'rgba(255,77,79,0.15)',
  LEAVE: 'rgba(22,119,255,0.12)',
  LEAVE_HALF: 'rgba(19,194,194,0.12)',
  HOLIDAY: 'rgba(114,46,209,0.12)',
  MISSING_IN: 'rgba(250,140,22,0.18)',
  MISSING_OUT: 'rgba(250,140,22,0.18)',
  NO_SCHEDULE: 'rgba(250,173,20,0.18)',
};

export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekday = (ymd: string) => WEEKDAY_SHORT[dayjs(ymd).day()];

/** Giờ VN "HH:mm" từ thời điểm ISO */
export const vnTime = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm') : '—');

/** Bộ chọn đơn vị + tháng dùng chung (mặc định: đơn vị của tài khoản, tháng hiện tại) */
export function useUnitMonth() {
  const { data: me } = useMe();
  const [unitId, setUnitId] = useState<string>();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  return { unitId: unitId ?? me?.unit?.id, setUnitId, month, setMonth };
}
