'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { DataScope } from '@bachmai/shared';
import { api } from './api';

export interface RefItem {
  id: string;
  code: string;
  name: string;
}

export interface Me {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  campus: RefItem | null;
  unit: RefItem | null;
  roles: RefItem[];
  permissions: string[];
  dataScope: DataScope;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 60_000 });
}

/** `can('a')` hoặc `can(['a','b'])` — true nếu có ÍT NHẤT MỘT quyền. */
export function useCan() {
  const { data } = useMe();
  return useCallback(
    (perm?: string | string[]) => {
      if (!perm) return true;
      const list = Array.isArray(perm) ? perm : [perm];
      return list.some((p) => data?.permissions.includes(p));
    },
    [data],
  );
}
