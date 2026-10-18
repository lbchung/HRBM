/**
 * Danh mục quyền chức năng. Mã quyền: `<module>.<resource>.<action>`.
 * Seed sẽ upsert toàn bộ danh mục này vào DB — thêm quyền mới chỉ cần khai báo ở đây.
 */
export const PERMISSION_MODULES = {
  system: 'Hệ thống',
  org: 'Tổ chức',
  hr: 'Nhân sự',
  attendance: 'Chấm công',
  leave: 'Nghỉ - Công tác',
  duty: 'Trực',
  payroll: 'Tiền lương',
  tax: 'Thuế TNCN',
  self: 'Cá nhân',
} as const;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

export interface PermissionDef {
  code: string;
  module: PermissionModule;
  name: string;
}

const p = (code: string, name: string): PermissionDef => ({
  code,
  module: code.split('.')[0] as PermissionModule,
  name,
});

export const PERMISSIONS = [
  // Hệ thống
  p('system.user.read', 'Xem tài khoản'),
  p('system.user.create', 'Tạo tài khoản'),
  p('system.user.update', 'Sửa tài khoản, đặt lại mật khẩu'),
  p('system.user.lock', 'Khóa / mở khóa tài khoản'),
  p('system.user.delete', 'Xóa tài khoản'),
  p('system.role.read', 'Xem nhóm tài khoản'),
  p('system.role.manage', 'Quản lý nhóm tài khoản và phân quyền'),
  p('system.audit.read', 'Xem nhật ký hệ thống'),
  p('system.config.manage', 'Quản lý tham số chính sách'),
  p('system.workflow.manage', 'Cấu hình quy trình duyệt'),
  p('system.integration.manage', 'Quản lý kết nối phần mềm ngoài (Fast)'),
  // Tổ chức
  p('org.campus.read', 'Xem cơ sở'),
  p('org.campus.manage', 'Quản lý cơ sở'),
  p('org.unit.read', 'Xem đơn vị'),
  p('org.unit.manage', 'Quản lý đơn vị'),
  p('org.catalog.manage', 'Quản lý danh mục dùng chung'),
  // Nhân sự
  p('hr.employee.read', 'Xem hồ sơ nhân viên'),
  p('hr.employee.create', 'Thêm hồ sơ nhân viên'),
  p('hr.employee.update', 'Sửa hồ sơ nhân viên (gia đình, công tác, hợp đồng, tài liệu)'),
  p('hr.employee.delete', 'Xóa hồ sơ nhân viên'),
  p('hr.employee.import', 'Import hồ sơ từ Excel'),
  p('hr.employee.export', 'Xuất danh sách nhân viên ra Excel'),
  p('hr.sensitive.read', 'Xem thông tin nhạy cảm (CCCD, MST, tài khoản ngân hàng)'),
  p('hr.training.manage', 'Quản lý đào tạo'),
  p('hr.reward.manage', 'Quản lý khen thưởng, kỷ luật'),
  p('hr.assignment.manage', 'Phân công làm việc giữa các cơ sở'),
  p('hr.salary.read', 'Xem thông tin lương, phụ cấp, hệ số trong hồ sơ'),
  p('hr.salary.manage', 'Cập nhật thông tin lương, phụ cấp, hệ số trong hồ sơ'),
  // Chấm công
  p('attendance.device.manage', 'Quản lý máy chấm công'),
  p('attendance.punch.read', 'Xem dữ liệu chấm công'),
  p('attendance.shift.manage', 'Quản lý ca làm việc, ca trực'),
  p('attendance.schedule.manage', 'Xếp lịch làm việc'),
  p('attendance.timesheet.read', 'Xem bảng công'),
  p('attendance.timesheet.adjust', 'Điều chỉnh công'),
  p('attendance.timesheet.confirm', 'Xác nhận công đơn vị'),
  p('attendance.timesheet.close', 'Chốt công tháng'),
  p('attendance.report.read', 'Xem báo cáo chấm công'),
  // Nghỉ - Công tác
  p('leave.request.create', 'Tạo phiếu nghỉ, công tác, học tập'),
  p('leave.request.approve', 'Duyệt phiếu'),
  p('leave.type.manage', 'Quản lý loại phiếu và quy trình duyệt'),
  // Trực
  p('duty.roster.manage', 'Xếp lịch trực'),
  p('duty.pay.read', 'Xem tiền trực'),
  // Tiền lương
  p('payroll.config.manage', 'Cấu hình thang bảng lương, khoản lương'),
  p('payroll.raise.manage', 'Quản lý nâng lương'),
  p('payroll.retro.manage', 'Quản lý truy lĩnh'),
  p('payroll.run', 'Tính lương'),
  p('payroll.close', 'Chốt bảng lương'),
  p('payroll.read', 'Xem bảng lương'),
  p('payroll.extra_income.propose', 'Đề xuất thu nhập tăng thêm'),
  p('payroll.extra_income.approve', 'Duyệt thu nhập tăng thêm'),
  // Thuế TNCN
  p('tax.read', 'Xem thuế TNCN'),
  p('tax.manage', 'Quản lý thuế TNCN, quyết toán'),
  // Cá nhân
  p('self.profile.read', 'Xem hồ sơ của tôi'),
  p('self.timesheet.read', 'Xem công của tôi'),
  p('self.payslip.read', 'Xem phiếu lương của tôi'),
  p('self.leave.create', 'Tạo phiếu nghỉ của tôi'),
] as const satisfies readonly PermissionDef[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSIONS.map((x) => x.code);
