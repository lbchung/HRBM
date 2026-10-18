# Quy tắc nghiệp vụ — Tiền lương

> ⏳ Chờ bệnh viện cung cấp công thức chi tiết và mẫu bảng lương.

Đã thống nhất:
- Hai hình thức: lương theo hệ số (hệ số × lương cơ sở) và lương khoán tiền đồng.
- Thu nhập tăng thêm: khoa đề xuất thanh toán → phòng TCKT duyệt.
- Ổn định thu nhập hàng tháng: theo hệ số ổn định, hệ số quản lý, hệ số khác của từng nhân viên.
- Mọi tham số (lương cơ sở, tỷ lệ phụ cấp, tỷ lệ bảo hiểm…) lưu theo ngày hiệu lực.
- Làm tròn tiền đến đồng, nửa lên (`packages/shared/src/money.ts`).

Cần xác nhận:
- Công thức thu nhập tăng thêm, ổn định thu nhập.
- Danh sách phụ cấp đang áp dụng và cách tính (theo hệ số hay theo tỷ lệ %).
- Quy định nâng lương thường xuyên / trước hạn / vượt khung đang áp dụng tại bệnh viện.
- Ngày chốt lương, kỳ chi trả.
