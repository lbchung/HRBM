# Quy tắc nghiệp vụ — Hệ thống & phân quyền

### SYS-01 — Chính sách mật khẩu
- Tối thiểu 8 ký tự, có chữ hoa, chữ thường, chữ số, ký tự đặc biệt.
- Mật khẩu mới phải khác mật khẩu hiện tại.
- Tài khoản mới / vừa đặt lại mật khẩu **bắt buộc đổi mật khẩu** ở lần đăng nhập đầu; trước khi đổi chỉ gọi được `/auth/me`, `/auth/change-password`, `/auth/logout`.
- Mã nguồn: `packages/shared/src/schemas/auth.ts`.

### SYS-02 — Khóa tài khoản
- Đăng nhập sai `LOGIN_MAX_FAILED` (mặc định 5) lần liên tiếp → tạm khóa `LOGIN_LOCK_MINUTES` (mặc định 15) phút.
- Quản trị có thể khóa thủ công (trạng thái `LOCKED`) → mọi phiên bị thu hồi ngay.
- Giới hạn 10 lần gọi đăng nhập / phút / IP.
- Chỉ thông báo trạng thái khóa/vô hiệu hóa khi người dùng nhập đúng mật khẩu (tránh dò tài khoản).

### SYS-03 — Phiên đăng nhập
- Access token 15 phút (cookie httpOnly); refresh token xoay vòng mỗi lần làm mới, lưu hash SHA-256.
- Phiên hết hạn tuyệt đối sau `SESSION_TTL_HOURS` (12 giờ), hoặc sau `SESSION_IDLE_MINUTES` (60 phút) không hoạt động.
- Đổi mật khẩu → đăng xuất các phiên khác. Khóa / vô hiệu hóa / xóa / đặt lại mật khẩu → đăng xuất mọi phiên.
- Mỗi request kiểm tra phiên còn hiệu lực và nạp quyền mới nhất → thu hồi quyền có hiệu lực ngay.

### SYS-04 — Phân quyền
- Quyền hiệu lực = hợp các quyền của mọi nhóm + quyền bổ sung riêng của tài khoản.
- Phạm vi dữ liệu = phạm vi **rộng nhất** trong các nhóm (ALL > CAMPUS > UNIT > SELF).
  - CAMPUS: theo cơ sở gốc của tài khoản.
  - UNIT: đơn vị của tài khoản + các đơn vị phụ trách.
  - SELF: chỉ dữ liệu của chính mình.
- Nhóm Quản trị hệ thống (ADMIN) luôn có toàn bộ quyền, không thể thu hẹp.
- Chống leo thang đặc quyền: người không có quyền `system.role.manage` chỉ được gán những nhóm mà toàn bộ quyền của nhóm đó mình đang có.
- Không thể tự khóa, tự vô hiệu hóa, tự xóa tài khoản của mình.

### SYS-05 — Nhật ký hệ thống
- Ghi mọi thao tác thêm/sửa/xóa, đăng nhập, đăng xuất, đăng nhập sai, đổi/đặt lại mật khẩu, khóa/mở khóa.
- Lưu: người thực hiện, thời gian, đối tượng, giá trị trước/sau, IP, trình duyệt.
- Không bao giờ ghi `passwordHash`, `totpSecret`, `refreshTokenHash`.
