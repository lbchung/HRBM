[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |[x] | 18/10/2026 |# KẾ HOẠCH & CHECKLIST TRIỂN KHAI — HRM Bệnh viện Bạch Mai

> Quy ước: `[x]` đã xong · `[ ]` chưa làm · `[~]` đang làm · `[!]` bị chặn (cần thông tin từ phía bệnh viện)
> Claude cập nhật file này **ngay sau khi hoàn thành mỗi đầu việc**, kèm ngày hoàn thành.
> Người dùng kiểm tra/nghiệm thu từng mục ở cột "Nghiệm thu" bằng cách tự đánh dấu `✔`.

## Tổng quan tiến độ

| Giai đoạn | Nội dung | Số việc | Đã xong | Trạng thái |
|---|---|---|---|---|
| 0 | Chuẩn bị & tài liệu | 6 | 4 | 🟡 Chờ thông tin từ bệnh viện |
| 1 | Nền tảng hệ thống | 24 | 24 | 🟢 Hoàn thành |
| 2 | Quản lý nhân sự | 22 | 19 | 🟡 Còn phần kết nối Fast (chờ tài liệu API) |
| 3 | Quản lý chấm công | 34 | 32 | 🟡 Còn thử máy thật + danh sách ca thực tế |
| 4 | Quản lý tiền lương | 26 | 23 | 🟡 Chờ công thức TNTT / ổn định thu nhập + mẫu in quyết định |
| 5 | Thuế TNCN | 10 | 0 | ⚪ Chưa bắt đầu |
| 6 | Hoàn thiện, kiểm thử, triển khai | 14 | 0 | ⚪ Chưa bắt đầu |
| 7 | Thay thế dần Fast | 6 | 0 | ⚪ Chưa bắt đầu |

---

## Giai đoạn 0 — Chuẩn bị & tài liệu

| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 0.1 | Tạo `CLAUDE.md` (kiến trúc, nguyên tắc, quy ước) | [x] | 18/10/2026 | |
| 0.2 | Tạo `PLAN.md` (kế hoạch & checklist) | [x] | 18/10/2026 | |
| 0.3 | Tạo `docs/glossary.md` — thuật ngữ Việt ↔ English | [x] | 18/10/2026 | |
| 0.4 | Tạo khung `docs/business-rules/` cho từng module | [x] | 18/10/2026 | |
| 0.5 | Thu thập tài liệu API Fast, model máy Hikvision, danh sách ca, mẫu báo cáo Excel | [!] | | |
| 0.6 | Thu thập công thức thu nhập tăng thêm, ổn định thu nhập, loại hợp đồng | [!] | | |

---

## Giai đoạn 1 — Nền tảng hệ thống

### 1A. Khởi tạo dự án
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 1.1 | Khởi tạo monorepo pnpm + Turborepo, git init, `.gitignore`, `.env.example` | [x] | 18/10/2026 | |
| 1.2 | Cấu hình chung: TypeScript strict, ESLint, Prettier, Conventional Commits | [x] | 18/10/2026 | |
| 1.3 | `docker-compose` cho PostgreSQL + Redis | [x] | 18/10/2026 | |
| 1.4 | Khung `apps/api` (NestJS) + Swagger `/api/v1` | [x] | 18/10/2026 | |
| 1.5 | Khung `apps/web` (Next.js + Ant Design) | [x] | 18/10/2026 | |
| 1.6 | Khung `apps/worker` (BullMQ) | [x] | 18/10/2026 | |
| 1.7 | `packages/shared` (Zod schemas, money/Decimal, rounding) + `packages/ui` | [x] | 18/10/2026 | |
| 1.8 | Prisma + migration đầu tiên + seed | [x] | 18/10/2026 | |

### 1B. Giao diện nền
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 1.9 | Theme Bạch Mai (`#008046`, `#ffc52c`, Roboto, Noto Serif), logo, dark mode | [x] | 18/10/2026 | |
| 1.10 | Layout chính: header, sidebar menu theo quyền, breadcrumb, chọn cơ sở | [x] | 18/10/2026 | |
| 1.11 | Trang đăng nhập, trang lỗi 403/404, trang hồ sơ cá nhân | [x] | 18/10/2026 | |
| 1.12 | Component dùng chung: bảng dữ liệu server-side, bộ lọc, form, upload, xuất Excel | [x] | 18/10/2026 | |

### 1C. Hệ thống, đăng nhập & phân quyền
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 1.13 | Đăng nhập JWT + refresh token, đăng xuất, đổi mật khẩu | [x] | 18/10/2026 | |
| 1.14 | Chính sách mật khẩu, khóa tài khoản khi sai nhiều lần, timeout phiên | [x] | 18/10/2026 | |
| 1.15 | Xác thực 2 lớp (TOTP) — tùy chọn | [x] | 18/10/2026 | |
| 1.16 | Quản lý tài khoản (CRUD, khóa/mở, reset mật khẩu) | [x] | 18/10/2026 | |
| 1.17 | Quản lý nhóm tài khoản; seed 5 nhóm: Admin, TCCB, TCKT, Trưởng khoa, Nhân viên | [x] | 18/10/2026 | |
| 1.18 | Danh mục quyền chức năng (permission) + gán quyền cho nhóm/tài khoản | [x] | 18/10/2026 | |
| 1.19 | Phạm vi dữ liệu (ALL / CAMPUS / UNIT / SELF) áp tự động vào truy vấn | [x] | 18/10/2026 | |
| 1.20 | Audit log (ai, khi nào, trước/sau, IP) + màn hình tra cứu | [x] | 18/10/2026 | |

### 1D. Tổ chức & cấu hình
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 1.21 | Danh mục cơ sở (Hà Nội, Ninh Bình) | [x] | 18/10/2026 | |
| 1.22 | Cây đơn vị (~60 khoa/phòng), chức vụ, chức danh nghề nghiệp | [x] | 18/10/2026 | |
| 1.23 | Bảng tham số chính sách có ngày hiệu lực (lương cơ sở, tỷ lệ BH, …) | [x] | 18/10/2026 | |
| 1.24 | Workflow engine duyệt nhiều bước (dùng chung cho đơn nghỉ, đề xuất…) | [x] | 18/10/2026 | |

> **Ghi chú Giai đoạn 1 (18/10/2026)**
> - 1.10: bộ chọn cơ sở trên header, ghi nhớ theo trình duyệt, là bộ lọc mặc định cho danh sách nhân viên / báo cáo.
> - 1.12: dịch vụ lưu file (kiểm tra chữ ký file chống đổi đuôi, kiểm tra quyền khi tải về), xuất Excel dùng chung, tải file/Excel từ giao diện.
> - 1.15: 2FA bằng Google/Microsoft Authenticator (mã QR), chống dùng lại mã, quản trị đặt lại được khi người dùng mất điện thoại.
> - 1.22: **danh mục dùng chung** 16 loại (chức vụ, chức danh nghề nghiệp, loại hợp đồng, dân tộc, tôn giáo, trình độ, ngân hàng, hình thức khen thưởng/kỷ luật, loại phụ cấp…) — 190 mục khởi tạo, quản lý tại Tổ chức → Danh mục dùng chung. Đơn vị: 10 mẫu, danh sách đầy đủ import sau.
> - 1.23: 13 tham số (lương cơ sở, tỷ lệ BHXH/BHYT/BHTN, KPCĐ, giảm trừ gia cảnh…) có lịch sử hiệu lực; **⚠ TCKT cần rà soát giá trị khởi tạo** (đặc biệt mức giảm trừ gia cảnh từ 01/01/2026).
> - 1.24: quy trình duyệt nhiều bước (người duyệt: chọn khi gửi / phụ trách đơn vị / theo nhóm), màn hình "Việc cần duyệt" có đếm số phiếu chờ; phiếu giữ ảnh chụp các bước lúc gửi.
> - Kiểm thử: 25/25 smoke test lần 1 + 73/73 smoke test lần 2 qua web đạt; 70 unit test đạt.

---

## Giai đoạn 2 — Quản lý nhân sự

### 2A. Hồ sơ nhân viên
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 2.1 | Mô hình dữ liệu hồ sơ nhân viên (mã hóa CCCD, STK, MST) | [x] | 18/10/2026 | |
| 2.2 | Danh sách nhân viên: lọc cơ sở/đơn vị/chức danh, tìm kiếm, phân trang, xuất Excel | [x] | 18/10/2026 | |
| 2.3 | Màn hình chi tiết hồ sơ dạng tab (thông tin chung, gia đình, liên hệ, ngân hàng…) | [x] | 18/10/2026 | |
| 2.4 | Thêm/sửa/nghỉ việc nhân viên + lịch sử thay đổi | [x] | 18/10/2026 | |
| 2.5 | Hợp đồng / loại đối tượng lao động | [x] | 18/10/2026 | |
| 2.6 | Quá trình công tác (điều động, bổ nhiệm, chuyển đơn vị) | [x] | 18/10/2026 | |
| 2.7 | Phân công làm việc giữa 2 cơ sở theo khoảng ngày | [x] | 18/10/2026 | |
| 2.8 | File đính kèm hồ sơ (quyết định, văn bằng) | [x] | 18/10/2026 | |
| 2.9 | Import hồ sơ từ Excel (có kiểm tra lỗi, báo cáo dòng lỗi) | [x] | 18/10/2026 | |

### 2B. Đào tạo, khen thưởng, kỷ luật
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 2.10 | Quá trình đào tạo (văn bằng, chứng chỉ, CME, hạn chứng chỉ hành nghề) | [x] | 18/10/2026 | |
| 2.11 | Khen thưởng (hình thức, cấp, quyết định) | [x] | 18/10/2026 | |
| 2.12 | Kỷ luật (hình thức, thời hạn, ảnh hưởng nâng lương) | [x] | 18/10/2026 | |
| 2.13 | Báo cáo đào tạo, khen thưởng, kỷ luật | [x] | 18/10/2026 | |

### 2C. Thông tin lương & phụ cấp trong hồ sơ
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 2.14 | Ngạch/bậc/hệ số lương theo hiệu lực | [x] | 18/10/2026 | |
| 2.15 | Lương khoán tiền đồng theo hiệu lực | [x] | 18/10/2026 | |
| 2.16 | Phụ cấp của nhân viên (chức vụ, ưu đãi nghề, độc hại, thâm niên vượt khung…) | [x] | 18/10/2026 | |
| 2.17 | Hệ số ổn định, hệ số quản lý, hệ số khác theo hiệu lực | [x] | 18/10/2026 | |
| 2.18 | Người phụ thuộc (phục vụ thuế TNCN) | [x] | 18/10/2026 | |

### 2D. Kết nối Fast (giai đoạn đọc)
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 2.19 | Adapter `integrations/fast` + cấu hình kết nối | [!] | | |
| 2.20 | Đồng bộ incremental đơn vị, nhân viên, lương từ Fast (`source`, `external_id`) | [!] | | |
| 2.21 | Bảng `integration_ownership` — nguồn chuẩn theo loại dữ liệu | [x] | 18/10/2026 | |
| 2.22 | Nhật ký đồng bộ + báo cáo chênh lệch + nút đồng bộ lại thủ công | [~] | | |

> **Ghi chú Giai đoạn 2 (18/10/2026)**
> - Hồ sơ: CCCD, MST, số tài khoản **mã hóa AES-256-GCM**; người không có quyền "xem thông tin nhạy cảm" chỉ thấy 4 số cuối. Tìm kiếm không dấu (gõ "nguyen van" ra "Nguyễn Văn").
> - Chi tiết hồ sơ 10 tab: thông tin chung, gia đình/người phụ thuộc, quá trình công tác (tùy chọn cập nhật đơn vị/chức vụ hiện tại), hợp đồng, phân công cơ sở (chặn chồng lấn thời gian), đào tạo, khen thưởng/kỷ luật, lương/phụ cấp/hệ số ổn định-quản lý-khác, tài liệu, lịch sử thay đổi.
> - Tạo tài khoản đăng nhập cho nhân viên từ hồ sơ (tên đăng nhập = mã NV). Nhân viên xem hồ sơ của mình tại Cá nhân → Hồ sơ nhân sự của tôi.
> - Import Excel 2 bước (kiểm tra → ghi), tất cả hoặc không; file mẫu kèm sheet tra cứu mã. Xuất Excel danh sách và mọi báo cáo.
> - Báo cáo: đào tạo/chứng chỉ (lọc sắp hết hạn), khen thưởng, kỷ luật, hợp đồng sắp hết hạn, phân công cơ sở theo tháng; phân công nhiều người cùng lúc.
> - 2.19/2.20 **[!] chờ tài liệu API Fast**: đã có khung adapter `FastClient`, biến `.env` FAST_API_URL/FAST_API_KEY, cột `source`/`external_id`.
> - 2.22 [~]: đã có nhật ký đồng bộ + nút đồng bộ thủ công; còn báo cáo chênh lệch (cần dữ liệu Fast).
> - 2.21: mặc định Fast là nguồn chuẩn — hồ sơ đồng bộ từ Fast chỉ đọc; hồ sơ tạo trong hệ thống mới luôn sửa được.

---

## Giai đoạn 3 — Quản lý chấm công

### 3A. Máy chấm công Hikvision
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 3.1 | Danh mục địa điểm & máy (IP, cổng, cơ sở, mật khẩu mã hóa) | [x] | 18/10/2026 | |
| 3.2 | Adapter Hikvision ISAPI (`AcsEvent`, Digest auth, phân trang) | [x] | 18/10/2026 | |
| 3.3 | Job đồng bộ 5 phút/lần, mỗi máy một job, concurrency giới hạn | [x] | 18/10/2026 | |
| 3.4 | Watermark theo máy + overlap window + chống trùng `(device_id, serial_no)` | [x] | 18/10/2026 | |
| 3.5 | Retry backoff, tự lấy bù khi máy offline | [x] | 18/10/2026 | |
| 3.6 | Giám sát máy: online/offline, lần sync cuối, lệch giờ; cảnh báo | [x] | 18/10/2026 | |
| 3.7 | Bảng dữ liệu quét gốc partition theo tháng | [x] | 18/10/2026 | |
| 3.8 | Mapping nhân viên ↔ `employeeNo` máy; hàng chờ quét không map được | [x] | 18/10/2026 | |
| 3.9 | Màn hình tra cứu dữ liệu quét (theo người, máy, thời gian) | [x] | 18/10/2026 | |
| 3.10 | Kiểm thử với máy thật (1 máy pilot → toàn bộ 20 máy) | [!] | | |

### 3B. Ca làm việc & lịch
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 3.11 | Danh mục ca làm việc (giờ vào/ra, nghỉ giữa ca, qua đêm, ngưỡng muộn/sớm, công quy đổi) | [x] | 18/10/2026 | |
| 3.12 | Danh mục ca trực | [x] | 18/10/2026 | |
| 3.13 | Nhập danh sách ca thực tế của bệnh viện | [!] | | |
| 3.14 | Ca mặc định theo đơn vị | [x] | 18/10/2026 | |
| 3.15 | Xếp lịch làm việc theo nhân viên/ngày (dạng lưới tháng, kéo thả, sao chép tuần) | [x] | 18/10/2026 | |
| 3.16 | Xếp lịch trực | [x] | 18/10/2026 | |
| 3.17 | Import lịch làm việc/lịch trực từ Excel | [x] | 18/10/2026 | |

### 3C. Nghỉ, công tác, học tập, bù trực
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 3.18 | Danh mục loại phiếu: ốm, phép, bù trực, công tác, học tập… | [x] | 18/10/2026 | |
| 3.19 | Khoa/phòng tạo phiếu, chọn tài khoản duyệt | [x] | 18/10/2026 | |
| 3.20 | Quy trình duyệt nhiều bước cấu hình theo loại phiếu | [x] | 18/10/2026 | |
| 3.21 | Thông báo khi có phiếu cần duyệt / phiếu được duyệt | [x] | 18/10/2026 | |
| 3.22 | Quỹ ngày phép năm của nhân viên | [x] | 18/10/2026 | |
| 3.23 | Phiếu đã duyệt/hủy tự động cập nhật bảng công | [x] | 18/10/2026 | |

### 3D. Tính công
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 3.24 | Engine tính công ngày (quét + lịch ca + phiếu), chạy lại được | [x] | 18/10/2026 | |
| 3.25 | Xác định cơ sở làm việc thực tế theo ngày; cảnh báo không khớp phân công | [x] | 18/10/2026 | |
| 3.26 | Điều chỉnh công thủ công (có lý do, audit) | [x] | 18/10/2026 | |
| 3.27 | Đơn vị xác nhận công → TCCB chốt công tháng → khóa | [x] | 18/10/2026 | |
| 3.28 | Unit test toàn bộ quy tắc tính công | [x] | 18/10/2026 | |

### 3E. Báo cáo chấm công
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 3.29 | Báo cáo kết quả chấm công tháng (theo mẫu bệnh viện, tách cơ sở) | [x] | 18/10/2026 | |
| 3.30 | Báo cáo đi muộn, về sớm | [x] | 18/10/2026 | |
| 3.31 | Báo cáo trực | [x] | 18/10/2026 | |
| 3.32 | Tính tiền trực + báo cáo tiền trực | [x] | 18/10/2026 | |
| 3.33 | Dashboard chấm công (đi làm hôm nay, muộn/sớm, nghỉ, trạng thái máy) | [x] | 18/10/2026 | |
| 3.34 | Nhân viên xem công của mình (web/PWA) | [x] | 18/10/2026 | |

> **Ghi chú Giai đoạn 3 (18/10/2026)**
> - Quy tắc tính công: [docs/business-rules/attendance.md](docs/business-rules/attendance.md) — các mục ⚠ là mặc định, **chờ TCCB xác nhận** (đi muộn không trừ công, thiếu giờ ra = 0 công chờ điều chỉnh, ngày lễ 0 công, phép năm +1 ngày/5 năm…).
> - 3.7: dùng **chỉ mục BRIN** theo thời gian thay cho partition tháng (Prisma không quản lý được bảng partition; BRIN đủ nhanh cho ~9 triệu lượt/năm). Chuyển sang partition khi > 50 triệu dòng.
> - 3.10 / 3.13 [!]: đã kiểm thử với **máy giả lập Hikvision ISAPI** (`tools/hikvision-mock`) — cần 1 máy thật để thử và danh sách ca thực tế.
> - Máy mới thêm vào lấy bù 31 ngày dữ liệu ở lần đồng bộ đầu.
> - Thông báo trong ứng dụng (chuông trên thanh trên cùng) khi có phiếu cần duyệt / được duyệt / bị từ chối.
> - Kiểm thử: 30 unit test engine tính công + 3 test xác thực Digest; 58/58 smoke test toàn luồng (máy → đồng bộ → tính công → phiếu nghỉ duyệt 2 bước → điều chỉnh → chốt → báo cáo).

---

## Giai đoạn 4 — Quản lý tiền lương

### 4A. Cấu hình lương
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 4.1 | Thang/bảng lương, bậc, hệ số theo hiệu lực | [x] | 18/10/2026 | |
| 4.2 | Danh mục khoản lương (thu nhập/khấu trừ, chịu thuế, chịu BH, công thức) | [x] | 18/10/2026 | |
| 4.3 | Engine công thức an toàn (không chạy code tùy ý), có kiểm thử công thức | [x] | 18/10/2026 | |
| 4.4 | Tỷ lệ BHXH/BHYT/BHTN/KPCĐ theo hiệu lực | [x] | 18/10/2026 | |

### 4B. Nâng lương
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 4.5 | Tự động lập danh sách đến hạn nâng lương thường xuyên (tháng/năm) | [x] | 18/10/2026 | |
| 4.6 | Nâng lương trước hạn (do thành tích) | [x] | 18/10/2026 | |
| 4.7 | Phụ cấp thâm niên vượt khung | [x] | 18/10/2026 | |
| 4.8 | Xét ảnh hưởng kỷ luật/nghỉ không lương đến thời hạn nâng lương | [x] | 18/10/2026 | |
| 4.9 | Duyệt + ra quyết định nâng lương (in quyết định, cập nhật hồ sơ) | [~] | | |

### 4C. Bảng lương tháng
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 4.10 | Tạo kỳ lương, lấy dữ liệu công đã chốt | [x] | 18/10/2026 | |
| 4.11 | Tính lương theo hệ số | [x] | 18/10/2026 | |
| 4.12 | Tính lương khoán tiền đồng | [x] | 18/10/2026 | |
| 4.13 | Tính phụ cấp, khấu trừ bảo hiểm | [x] | 18/10/2026 | |
| 4.14 | Chạy tính lương bằng job nền (6.000 người), xem tiến độ | [x] | 18/10/2026 | |
| 4.15 | Xem/kiểm tra/chốt bảng lương → khóa | [x] | 18/10/2026 | |
| 4.16 | Phiếu lương cá nhân (nhân viên xem trên web/PWA) | [x] | 18/10/2026 | |
| 4.17 | Xuất bảng lương, file chuyển khoản ngân hàng | [x] | 18/10/2026 | |

### 4D. Truy lĩnh
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 4.18 | Phát hiện quyết định hồi tố → tính chênh lệch từng kỳ theo tham số hiệu lực | [x] | 18/10/2026 | |
| 4.19 | Truy lĩnh phụ cấp | [x] | 18/10/2026 | |
| 4.20 | Đưa khoản truy lĩnh vào kỳ lương hiện tại + báo cáo truy lĩnh | [x] | 18/10/2026 | |

### 4E. Thu nhập tăng thêm & ổn định thu nhập
| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 4.21 | Khoa lập đề xuất thanh toán thu nhập tăng thêm | [x] | 18/10/2026 | |
| 4.22 | Phòng TCKT duyệt đề xuất → đưa vào kỳ chi | [x] | 18/10/2026 | |
| 4.23 | Công thức thu nhập tăng thêm | [!] | | |
| 4.24 | Tính ổn định thu nhập hàng tháng theo hệ số ổn định/quản lý/khác | [!] | | |
| 4.25 | Báo cáo thu nhập tổng hợp theo khoa, theo cơ sở | [x] | 18/10/2026 | |
| 4.26 | Unit test toàn bộ tính lương, nâng lương, truy lĩnh | [x] | 18/10/2026 | |

> **Ghi chú Giai đoạn 4 (18/10/2026)**
> - Quy tắc: [docs/business-rules/payroll.md](docs/business-rules/payroll.md) — các mục ⚠ là mặc định, **chờ TCKT/TCCB xác nhận** (bộ khoản lương & công thức mẫu, thang lương NĐ 204, lương/phụ cấp lấy theo hồ sơ hiệu lực ngày đầu tháng, nâng trước hạn tính mốc lần sau từ hạn cũ…).
> - Công thức lương là **cấu hình** (Cấu hình lương → Khoản lương): engine tự viết, không chạy code tùy ý; chỉ dùng biến đầu vào, phụ cấp và khoản tính trước; có nút tính thử cho một nhân viên.
> - 4.9 [~]: đã duyệt + tạo diễn biến lương mới + xuất Excel danh sách; **chưa có mẫu in quyết định** — cần mẫu của bệnh viện.
> - 4.17: file chuyển khoản dạng Excel chung (STK, ngân hàng, số tiền) — đổi theo mẫu của ngân hàng khi có.
> - 4.23 / 4.24 [!]: TNTT hiện do khoa nhập số tiền từng người (nhập tay hoặc Excel); khoản ổn định thu nhập `ON_DINH_TN` đang để công thức 0 — các biến `STAB_COEF`, `MGMT_COEF`, `OTHER_COEF` đã sẵn, chỉ cần TCKT cung cấp công thức là nhập vào cấu hình.
> - Kiểm thử: 40 unit test (công thức, phiếu lương, nâng lương, truy lĩnh); 74/74 smoke test toàn luồng (cấu hình → tính lương nền → chốt → nâng lương hồi tố → truy lĩnh → TNTT duyệt 2 bên → kỳ sau → truy lĩnh lần 2 không trùng) + kiểm tra giao diện bằng trình duyệt.

---

## Giai đoạn 5 — Thuế TNCN

| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 5.1 | Biểu thuế lũy tiến + giảm trừ gia cảnh theo hiệu lực | [ ] | | |
| 5.2 | Đăng ký người phụ thuộc, MST | [ ] | | |
| 5.3 | Xác định thu nhập chịu thuế từ cờ `taxable` của khoản lương | [ ] | | |
| 5.4 | Khấu trừ thuế hàng tháng trong bảng lương | [ ] | | |
| 5.5 | Khấu trừ 10% thu nhập vãng lai | [ ] | | |
| 5.6 | Cam kết 08 (không khấu trừ) | [ ] | | |
| 5.7 | Quyết toán thuế năm (ủy quyền quyết toán) | [ ] | | |
| 5.8 | Chứng từ khấu trừ thuế TNCN | [ ] | | |
| 5.9 | Báo cáo/tờ khai thuế theo mẫu (xuất Excel/XML) | [ ] | | |
| 5.10 | Unit test tính thuế | [ ] | | |

---

## Giai đoạn 6 — Hoàn thiện, kiểm thử, triển khai

| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 6.1 | E2E test (Playwright): đăng nhập, duyệt phiếu, chốt công, chạy lương | [ ] | | |
| 6.2 | Kiểm thử hiệu năng với dữ liệu 6.000 nhân sự, 1 năm chấm công | [ ] | | |
| 6.3 | Rà soát bảo mật (phân quyền, mã hóa, OWASP) | [ ] | | |
| 6.4 | Tuân thủ bảo vệ dữ liệu cá nhân (NĐ 13/2023, Luật BVDLCN) | [ ] | | |
| 6.5 | PWA cho nhân viên (cài lên điện thoại) | [ ] | | |
| 6.6 | Docker production + HTTPS + reverse proxy | [ ] | | |
| 6.7 | Backup/restore DB tự động hàng ngày | [ ] | | |
| 6.8 | Giám sát hệ thống, log tập trung, cảnh báo | [ ] | | |
| 6.9 | Chuyển đổi dữ liệu ban đầu (Fast + Excel) | [ ] | | |
| 6.10 | Tài liệu hướng dẫn sử dụng theo từng nhóm tài khoản | [ ] | | |
| 6.11 | Tài liệu vận hành / quản trị hệ thống | [ ] | | |
| 6.12 | Chạy thử (pilot) tại 1–2 khoa | [ ] | | |
| 6.13 | Chạy song song với Fast 1–2 kỳ lương, đối chiếu kết quả | [ ] | | |
| 6.14 | Go-live toàn viện | [ ] | | |

---

## Giai đoạn 7 — Thay thế dần Fast

| # | Đầu việc | Trạng thái | Ngày xong | Nghiệm thu |
|---|---|---|---|---|
| 7.1 | Chuyển nguồn chuẩn: danh mục tổ chức | [ ] | | |
| 7.2 | Chuyển nguồn chuẩn: hồ sơ nhân sự | [ ] | | |
| 7.3 | Chuyển nguồn chuẩn: thông tin lương, phụ cấp | [ ] | | |
| 7.4 | Chuyển nguồn chuẩn: lương tháng & thuế | [ ] | | |
| 7.5 | Đẩy ngược dữ liệu về Fast (nếu còn cần trong giai đoạn chuyển tiếp) | [ ] | | |
| 7.6 | Ngừng sử dụng Fast, lưu trữ dữ liệu lịch sử | [ ] | | |

---

## Nhật ký thay đổi kế hoạch

| Ngày | Nội dung |
|---|---|
| 18/10/2026 | Tạo kế hoạch ban đầu |
| 18/10/2026 | Cài môi trường (Node 24, PostgreSQL 17, Memurai, Git); hoàn thành 18/24 việc Giai đoạn 1 |
| 18/10/2026 | Hoàn thành Giai đoạn 1 (24/24); Giai đoạn 2: 19/22 (còn kết nối Fast) |
| 18/10/2026 | Giai đoạn 3: 32/34 (còn thử máy thật, danh sách ca thực tế) |
