'use client';

import { useQuery } from '@tanstack/react-query';
import type { DataScope, UnitType } from '@bachmai/shared';
import { api } from './api';

export interface Campus {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  type: UnitType;
  parentId: string | null;
  campusId: string | null;
  sortOrder: number;
  isActive: boolean;
  campus: { id: string; code: string; name: string } | null;
  _count: { users: number };
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataScope: DataScope;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
}

export const useCampuses = () =>
  useQuery({ queryKey: ['campuses'], queryFn: () => api<Campus[]>('/org/campuses'), staleTime: 5 * 60_000 });

export const useUnits = () =>
  useQuery({ queryKey: ['units'], queryFn: () => api<Unit[]>('/org/units'), staleTime: 5 * 60_000 });

export const useRoles = () =>
  useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), staleTime: 60_000 });

export interface TreeNode {
  value: string;
  title: string;
  key: string;
  children?: TreeNode[];
}

/**
 * Dựng cây đơn vị cho TreeSelect từ danh sách phẳng.
 * `excludeId`: loại bỏ đơn vị này và toàn bộ cây con (dùng khi chọn đơn vị cha).
 */
export function buildUnitTree(units: Unit[], excludeId?: string): TreeNode[] {
  const ids = new Set(units.map((u) => u.id));
  const byParent = new Map<string | null, Unit[]>();
  for (const u of units) {
    if (u.id === excludeId) continue;
    // Cha không tồn tại trong danh sách → coi là gốc
    const parent = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), u]);
  }
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((u) => {
      const children = build(u.id);
      return { value: u.id, key: u.id, title: u.name, children: children.length ? children : undefined };
    });
  return build(null);
}
