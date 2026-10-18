import type { UserStatus } from '@bachmai/shared';
import type { RefItem } from '@/lib/auth';

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  campusId: string | null;
  unitId: string | null;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  createdAt: string;
  campus: RefItem | null;
  unit: RefItem | null;
  roles: RefItem[];
  managedUnits: RefItem[];
}
