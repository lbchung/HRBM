import type { AuthUser } from './auth-user';

export interface ScopeFields {
  /** Trường chứa campus_id của bản ghi */
  campus?: string;
  /** Trường chứa unit_id của bản ghi */
  unit?: string;
  /** Trường chứa id người dùng sở hữu bản ghi */
  self?: string;
}

/** Điều kiện không bao giờ khớp — dùng khi tài khoản không có phạm vi phù hợp. */
const DENY = { id: { in: [] as string[] } };

/**
 * Sinh điều kiện Prisma `where` theo phạm vi dữ liệu của người dùng.
 * Mọi truy vấn danh sách dữ liệu nghiệp vụ PHẢI kết hợp điều kiện này.
 */
export function scopeWhere(user: AuthUser, fields: ScopeFields): Record<string, unknown> {
  switch (user.dataScope) {
    case 'ALL':
      return {};
    case 'CAMPUS':
      return fields.campus && user.campusId ? { [fields.campus]: user.campusId } : DENY;
    case 'UNIT': {
      const unitIds = [...new Set([...user.managedUnitIds, ...(user.unitId ? [user.unitId] : [])])];
      return fields.unit && unitIds.length ? { [fields.unit]: { in: unitIds } } : DENY;
    }
    case 'SELF':
      return fields.self ? { [fields.self]: user.id } : DENY;
  }
}
