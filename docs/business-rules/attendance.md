# Quy tắc nghiệp vụ — Chấm công

> Đã hiện thực trong `packages/shared/src/attendance/engine.ts` (có unit test).
> Các mục đánh dấu ⚠ là **quy tắc mặc định đang áp dụng — chờ Phòng TCCB xác nhận**. Mọi thông số giờ/ngưỡng đều cấu hình được tại *Chấm công → Ca, ngày lễ, tiền trực*.

### ATT-01 — Ca làm việc / ca trực
- Mỗi ca: giờ vào, giờ ra (giờ Việt Nam), nghỉ giữa ca, số phút cho phép đi muộn / về sớm, số công quy đổi.
- Giờ ra ≤ giờ vào → ca qua đêm (kết thúc ngày hôm sau).
- Cửa sổ nhận lượt quét: từ *giờ vào − "nhận quét vào trước"* đến *giờ ra + "nhận quét ra sau"* (mặc định 120 / 240 phút).
- ⏳ Danh sách ca hiện là dữ liệu mẫu (HC, K1–K3, N12, D12, T24, T16).

### ATT-02 — Tính công một ca
| Tình huống | Kết quả | Công |
|---|---|---|
| Có giờ vào và giờ ra trong cửa sổ ca | Đi làm — `X` (ca trực: `T`) | đủ công của ca |
| Đi muộn / về sớm quá số phút cho phép | Ghi nhận đi muộn / về sớm | ⚠ **không trừ công** |
| Chỉ có 1 lượt quét | Thiếu giờ vào / ra — `?` | ⚠ 0 công, chờ đơn vị điều chỉnh |
| Không quét, không phiếu | Vắng — `K` | 0 |
| Phiếu nghỉ cả ngày (đã duyệt) | Ký hiệu theo loại phiếu (P, Ô, CT, H…) | loại "tính công" (CT, H) → đủ công; còn lại 0 |
| Nghỉ nửa ngày + đi làm nửa ngày | `X/P`… | ½ công làm + ½ nếu phiếu tính công; không xét đi muộn (nghỉ sáng) / về sớm (nghỉ chiều) |
| Ngày lễ không đi làm | `L` | ⚠ 0 công (lương ngày lễ xử lý ở bảng lương) |
| Có quét nhưng không xếp ca | Chưa xếp ca — `?` | 0, chờ đơn vị xử lý |

- Một lượt quét có thể dùng cho 2 ca liền kề (vd: ra ca hành chính 16:30 = vào ca trực 16:30).
- Ca hôm nay chưa kết thúc mà chưa quét → chưa kết luận vắng (job 01:00 hằng đêm chốt kết quả ngày hôm trước).

### ATT-03 — Cơ sở làm việc
- Cơ sở phải làm = cơ sở trong *phân công làm việc* (nếu có) cho ngày đó, ngược lại = cơ sở gốc.
- Cơ sở thực tế = cơ sở của máy chấm công ghi nhận lượt vào.
- Khác nhau → đánh dấu "khác cơ sở phân công" để đơn vị xác nhận, **không tự loại bỏ**.
- Số công tổng hợp tách theo cơ sở thực tế.

### ATT-04 — Điều chỉnh, xác nhận, chốt
- Điều chỉnh từng ô công: ký hiệu + số công + **lý do bắt buộc**; ghi nhật ký; giữ nguyên khi tính lại; gỡ được.
- Trưởng khoa/phòng **xác nhận** công tháng → Phòng TCCB **chốt** → khóa (không tính lại, không điều chỉnh, không sửa lịch). Số liệu tổng hợp lưu vào `monthly_timesheets` làm đầu vào tính lương.
- Mở lại kỳ đã chốt: cần quyền chốt công + lý do, ghi nhật ký.

### ATT-05 — Phiếu nghỉ
- Số ngày = số ngày lịch từ ngày bắt đầu đến ngày kết thúc, **trừ ngày lễ**, trừ ½ nếu bắt đầu buổi chiều / kết thúc buổi sáng.
- ⚠ Chưa trừ ngày nghỉ hằng tuần (nhân viên y tế làm theo lịch ca/trực).
- Không cho trùng thời gian với phiếu khác đang chờ duyệt / đã duyệt của cùng nhân viên.
- Loại "trừ phép năm": không vượt quá số ngày phép còn lại (trừ cả phiếu đang chờ duyệt).
- Phiếu kéo dài qua 2 năm: ⚠ tính toàn bộ vào năm của ngày bắt đầu.
- Duyệt / hủy phiếu → bảng công các ngày liên quan được tính lại tự động.

### ATT-06 — Phép năm
- Được hưởng = tham số `ANNUAL_LEAVE_BASE_DAYS` (mặc định 12) + 1 ngày cho mỗi đủ 5 năm công tác tính theo ngày vào làm (⚠ Điều 113–114 BLLĐ 2019; ngạch/nghề nặng nhọc có thể nhiều hơn — TCCB điều chỉnh từng người).
- Còn lại = được hưởng + chuyển từ năm trước + điều chỉnh − đã nghỉ (phiếu đã duyệt).

### ATT-07 — Tiền trực
- Mức tiền trực khai báo theo từng ca trực, có ngày hiệu lực.
- Tiền trực của một ca = mức hiệu lực tại ngày trực × (số công thực tế / số công của ca).
- ⏳ Mức tiền trực theo quy định hiện hành do Phòng TCKT khai báo (chưa có dữ liệu).

### ATT-08 — Đồng bộ máy chấm công
- Mỗi 5 phút, mỗi máy một job (tối đa 5 máy song song, thử lại 3 lần, giãn cách tăng dần).
- Lấy từ mốc thời gian đã đồng bộ lùi 10 phút; máy mới hoặc mất kết nối lấy bù tối đa 31 ngày.
- Chống trùng theo (máy, số serial sự kiện). Dữ liệu quét gốc không bao giờ sửa/xóa.
- Mã chấm công trên máy (employeeNo) = trường "Mã chấm công" trong hồ sơ. Lượt quét chưa khớp hồ sơ → hàng chờ "Mã chấm công chưa gắn nhân viên".
- Cảnh báo: máy quá 15 phút không đồng bộ được; giờ máy lệch quá 2 phút.
