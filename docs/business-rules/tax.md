# Quy tắc nghiệp vụ — Thuế TNCN

> ⏳ Chờ phòng TCKT xác nhận.

Nguyên tắc:
- Biểu thuế, mức giảm trừ gia cảnh, giảm trừ người phụ thuộc lưu theo ngày hiệu lực — **không hard-code** (luật thuế có thể thay đổi).
- Thu nhập chịu thuế xác định từ cờ `taxable` của từng khoản lương.

Cần xác nhận:
- Các khoản thu nhập không chịu thuế / được miễn đang áp dụng.
- Quy trình cam kết mẫu 08, khấu trừ 10% thu nhập vãng lai.
- Mẫu tờ khai, chứng từ khấu trừ đang dùng.
