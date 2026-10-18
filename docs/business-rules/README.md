# Quy tắc nghiệp vụ

Mỗi module có một file mô tả quy tắc nghiệp vụ chi tiết. **Trước khi lập trình một quy tắc tính toán, quy tắc đó phải được ghi ở đây và được bệnh viện xác nhận.**

| File | Module | Trạng thái |
|---|---|---|
| [system.md](system.md) | Hệ thống, phân quyền | ✅ Đã áp dụng |
| [attendance.md](attendance.md) | Chấm công, ca, lịch | ⏳ Chờ danh sách ca thực tế |
| [leave.md](leave.md) | Nghỉ, công tác, học tập | ⏳ Chờ quy trình duyệt cụ thể |
| [payroll.md](payroll.md) | Tiền lương | ⏳ Chờ công thức TNTT, ổn định thu nhập |
| [tax.md](tax.md) | Thuế TNCN | ⏳ Chờ xác nhận |

Mẫu ghi một quy tắc:

```
### <Mã quy tắc> — <Tên>
- Căn cứ: <văn bản pháp lý / quy chế nội bộ>
- Hiệu lực: <từ ngày>
- Mô tả: ...
- Công thức: ...
- Ví dụ: <đầu vào> → <kết quả>   (dùng làm test case)
- Người xác nhận: <phòng ban, ngày>
```
