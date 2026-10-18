import type { DataScope } from '@bachmai/shared';

/** Ngữ cảnh người dùng gắn vào request sau khi xác thực. */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  sessionId: string;
  campusId: string | null;
  unitId: string | null;
  managedUnitIds: string[];
  roles: string[];
  permissions: Set<string>;
  dataScope: DataScope;
  mustChangePassword: boolean;
}

/** Thông tin client phục vụ audit log. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}
