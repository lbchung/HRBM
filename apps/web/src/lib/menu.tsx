import {
  ApartmentOutlined,
  AuditOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  MedicineBoxOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface MenuNode {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Quyền cần có (ít nhất một). Bỏ trống = mọi tài khoản đăng nhập. */
  permission?: string | string[];
  /** Chức năng chưa phát triển — hiển thị trang "Đang phát triển" */
  comingSoon?: string;
  children?: MenuNode[];
}

/** key = đường dẫn trang. */
export const MENU: MenuNode[] = [
  { key: '/', label: 'Tổng quan', icon: <DashboardOutlined /> },
  { key: '/approvals', label: 'Việc cần duyệt', icon: <CheckSquareOutlined /> },
  {
    key: 'hr',
    label: 'Nhân sự',
    icon: <TeamOutlined />,
    children: [
      { key: '/hr/employees', label: 'Hồ sơ nhân viên', permission: 'hr.employee.read' },
      { key: '/hr/assignments', label: 'Phân công cơ sở', permission: 'hr.employee.read' },
      { key: '/hr/training', label: 'Đào tạo, chứng chỉ', permission: 'hr.employee.read' },
      { key: '/hr/rewards', label: 'Khen thưởng - Kỷ luật', permission: 'hr.employee.read' },
      { key: '/hr/contracts', label: 'Hợp đồng sắp hết hạn', permission: 'hr.employee.read' },
    ],
  },
  {
    key: 'attendance',
    label: 'Chấm công',
    icon: <ClockCircleOutlined />,
    children: [
      { key: '/attendance/dashboard', label: 'Dashboard chấm công', permission: 'attendance.report.read' },
      { key: '/attendance/timesheets', label: 'Bảng công tháng', permission: 'attendance.timesheet.read' },
      { key: '/attendance/schedules', label: 'Lịch làm việc', permission: 'attendance.schedule.manage' },
      { key: '/attendance/late-early', label: 'Đi muộn, về sớm', permission: 'attendance.report.read' },
      { key: '/attendance/punches', label: 'Dữ liệu chấm Face ID', permission: 'attendance.punch.read' },
      { key: '/attendance/devices', label: 'Máy chấm công', permission: 'attendance.device.manage' },
      { key: '/attendance/shifts', label: 'Ca, ngày lễ, tiền trực', permission: ['attendance.shift.manage', 'duty.pay.read'] },
    ],
  },
  {
    key: 'leave',
    label: 'Nghỉ - Công tác',
    icon: <CalendarOutlined />,
    children: [
      { key: '/leave/requests', label: 'Phiếu nghỉ, công tác, học tập', permission: ['leave.request.create', 'leave.request.approve', 'self.leave.create'] },
      { key: '/leave/balances', label: 'Quỹ phép năm', permission: ['leave.type.manage', 'leave.request.approve', 'leave.request.create'] },
      { key: '/leave/types', label: 'Loại phiếu', permission: 'leave.type.manage' },
    ],
  },
  {
    key: 'duty',
    label: 'Trực',
    icon: <MedicineBoxOutlined />,
    children: [
      { key: '/duty/rosters', label: 'Lịch trực', permission: 'duty.roster.manage' },
      { key: '/duty/pay', label: 'Báo cáo trực, tiền trực', permission: ['duty.pay.read', 'attendance.report.read'] },
    ],
  },
  {
    key: 'payroll',
    label: 'Tiền lương',
    icon: <WalletOutlined />,
    children: [
      { key: '/payroll/runs', label: 'Bảng lương tháng', permission: 'payroll.read' },
      { key: '/payroll/raises', label: 'Nâng lương', permission: 'payroll.raise.manage' },
      { key: '/payroll/retro', label: 'Truy lĩnh', permission: 'payroll.retro.manage' },
      { key: '/payroll/extra-income', label: 'Thu nhập tăng thêm', permission: ['payroll.extra_income.propose', 'payroll.extra_income.approve'] },
      { key: '/payroll/config', label: 'Cấu hình lương', permission: 'payroll.config.manage' },
    ],
  },
  { key: '/tax', label: 'Thuế TNCN', icon: <AuditOutlined />, permission: 'tax.read', comingSoon: 'Giai đoạn 5' },
  {
    key: 'me',
    label: 'Cá nhân',
    icon: <UserOutlined />,
    children: [
      { key: '/me/employee', label: 'Hồ sơ nhân sự của tôi', permission: 'self.profile.read' },
      { key: '/profile', label: 'Tài khoản của tôi' },
      { key: '/me/timesheet', label: 'Công của tôi', permission: 'self.timesheet.read' },
      { key: '/me/payslips', label: 'Phiếu lương', permission: 'self.payslip.read' },
    ],
  },
  {
    key: 'org',
    label: 'Tổ chức',
    icon: <ApartmentOutlined />,
    children: [
      { key: '/org/campuses', label: 'Cơ sở', permission: 'org.campus.read' },
      { key: '/org/units', label: 'Đơn vị', permission: 'org.unit.read' },
      { key: '/org/catalogs', label: 'Danh mục dùng chung', permission: 'org.catalog.manage' },
    ],
  },
  {
    key: 'system',
    label: 'Hệ thống',
    icon: <SettingOutlined />,
    children: [
      { key: '/system/users', label: 'Tài khoản', permission: 'system.user.read' },
      { key: '/system/roles', label: 'Nhóm tài khoản & phân quyền', permission: 'system.role.read' },
      { key: '/system/workflows', label: 'Quy trình duyệt', permission: 'system.workflow.manage' },
      { key: '/system/parameters', label: 'Tham số chính sách', permission: ['system.config.manage', 'payroll.config.manage'] },
      { key: '/system/integrations', label: 'Kết nối Fast', permission: 'system.integration.manage' },
      { key: '/system/audit-logs', label: 'Nhật ký hệ thống', permission: 'system.audit.read' },
    ],
  },
];

/** Tìm mục menu theo đường dẫn (khớp chính xác, hoặc tiền tố dài nhất — vd /hr/employees/123). */
export function findMenu(path: string): { node: MenuNode; parent?: MenuNode; exact: boolean } | undefined {
  let best: { node: MenuNode; parent?: MenuNode; exact: boolean } | undefined;
  const consider = (node: MenuNode, parent?: MenuNode) => {
    if (node.key === path) best = { node, parent, exact: true };
    else if (node.key !== '/' && path.startsWith(`${node.key}/`) && (!best || (!best.exact && node.key.length > best.node.key.length))) {
      best = { node, parent, exact: false };
    }
  };
  for (const n of MENU) {
    consider(n);
    for (const c of n.children ?? []) consider(c, n);
    if (best?.exact) return best;
  }
  return best;
}
