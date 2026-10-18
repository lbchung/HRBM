import type { DataScope } from './data-scope';
import { ALL_PERMISSION_CODES, type PermissionCode } from './permissions';

export interface SystemRoleDef {
  code: string;
  name: string;
  description: string;
  dataScope: DataScope;
  permissions: PermissionCode[];
}

const byPrefix = (...prefixes: string[]): PermissionCode[] =>
  ALL_PERMISSION_CODES.filter((c) => prefixes.some((p) => c.startsWith(p)));

const SELF: PermissionCode[] = byPrefix('self.');

/** 5 nhóm tài khoản mặc định. Seed tạo mới nếu chưa có; không ghi đè quyền đã chỉnh trên giao diện. */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    code: 'ADMIN',
    name: 'Quản trị hệ thống',
    description: 'Toàn quyền quản trị, cấu hình và phân quyền',
    dataScope: 'ALL',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    code: 'TCCB',
    name: 'Phòng Tổ chức cán bộ',
    description: 'Quản lý hồ sơ nhân sự, chấm công, nâng lương',
    dataScope: 'ALL',
    permissions: [
      ...byPrefix('org.', 'hr.', 'attendance.', 'leave.', 'duty.'),
      'system.workflow.manage',
      'payroll.raise.manage',
      'payroll.retro.manage',
      'payroll.read',
      'system.user.read',
      ...SELF,
    ],
  },
  {
    code: 'TCKT',
    name: 'Phòng Tài chính kế toán',
    description: 'Quản lý tiền lương, thu nhập tăng thêm, thuế TNCN',
    dataScope: 'ALL',
    permissions: [
      ...byPrefix('payroll.', 'tax.'),
      'org.campus.read',
      'org.unit.read',
      'hr.employee.read',
      'hr.employee.export',
      'hr.sensitive.read',
      'hr.salary.read',
      'attendance.timesheet.read',
      'attendance.report.read',
      'duty.pay.read',
      ...SELF,
    ],
  },
  {
    code: 'TRUONG_KHOA',
    name: 'Trưởng khoa / phòng',
    description: 'Quản lý nhân sự, công, phiếu nghỉ của đơn vị phụ trách',
    dataScope: 'UNIT',
    permissions: [
      'org.campus.read',
      'org.unit.read',
      'hr.employee.read',
      'attendance.punch.read',
      'attendance.schedule.manage',
      'attendance.timesheet.read',
      'attendance.timesheet.confirm',
      'attendance.report.read',
      'leave.request.create',
      'leave.request.approve',
      'duty.roster.manage',
      'payroll.extra_income.propose',
      ...SELF,
    ],
  },
  {
    code: 'NHAN_VIEN',
    name: 'Nhân viên',
    description: 'Xem thông tin, công, lương của bản thân',
    dataScope: 'SELF',
    permissions: SELF,
  },
];
