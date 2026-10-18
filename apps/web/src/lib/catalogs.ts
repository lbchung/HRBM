'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CatalogType } from '@bachmai/shared';
import { api } from './api';

export interface CatalogItem {
  id: string;
  type: CatalogType;
  code: string;
  name: string;
  description: string | null;
  meta: Record<string, string | number | null> | null;
  sortOrder: number;
  isActive: boolean;
}

/** Toàn bộ danh mục (~vài trăm mục) — tải một lần, dùng chung cho mọi select và hiển thị tên. */
export function useCatalogs() {
  const q = useQuery({
    queryKey: ['catalogs', 'all'],
    queryFn: () => api<CatalogItem[]>('/catalogs', { query: { includeInactive: true } }),
    staleTime: 5 * 60_000,
  });
  const items = useCallback(
    (type: CatalogType, includeInactive = false) => (q.data ?? []).filter((i) => i.type === type && (includeInactive || i.isActive)),
    [q.data],
  );
  const name = useCallback(
    (type: CatalogType, code?: string | null) => (code ? (q.data?.find((i) => i.type === type && i.code === code)?.name ?? code) : '—'),
    [q.data],
  );
  return { ...q, items, name };
}
