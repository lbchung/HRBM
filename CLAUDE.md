# CLAUDE.md — Hệ thống Quản lý Nhân sự, Chấm công, Tiền lương — Bệnh viện Bạch Mai

> File này hướng dẫn Claude Code (và lập trình viên) khi làm việc trong repo.
> Phần **nghiệp vụ** viết bằng tiếng Việt; phần **quy ước kỹ thuật** viết bằng tiếng Anh.
> Dự án đang ở giai đoạn khởi tạo — các mục đánh dấu `⏳ CẦN BỔ SUNG` sẽ được cập nhật khi có thông tin.

---

## 1. Tổng quan dự án

Web app quản lý **nhân sự – chấm công – tiền lương – thuế TNCN** cho Bệnh viện Bạch Mai.

- **2 cơ sở**: Hà Nội và Ninh Bình.
- **Quy mô**: ~6.000 nhân sự, ~60 đơn vị (khoa/phòng/trung tâm).
- Nhân viên **làm việc linh động giữa 2 cơ sở** trong tháng (cả tháng hoặc vài ngày).
- **20 máy chấm công Face ID Hikvision** đặt tại các địa điểm thuộc 2 cơ sở.
- Bệnh viện đang dùng **phần mềm nhân sự Fast**: hệ thống này vừa có dữ liệu độc lập, vừa đồng bộ qua API với Fast, và **hướng tới thay thế dần Fast** theo từng module.

Mục tiêu: hiện đại, chuyên nghiệp, **mở rộng cao** — thêm module, thêm cơ sở, thay đổi chính sách lương/thuế **không phải sửa code**.

---

## 2. Chức năng chính (phạm vi ban đầu)

### 2.1. Hệ thống
- Đăng nhập, quản lý tài khoản, nhóm tài khoản.
- Phân quyền theo tài khoản và theo nhóm tài khoản (chi tiết ở mục 5).

### 2.2. Quản lý nhân sự
- Hồ sơ nhân viên: thông tin cá nhân, quá trình công tác.
- Quá trình đào tạo.
- Khen thưởng, kỷ luật.
- Thông tin lương, phụ cấp.
- Phân công làm việc giữa 2 cơ sở (theo khoảng ngày).

### 2.3. Quản lý chấm công
- Quản lý máy chấm công Face ID theo địa điểm.
- Quản lý dữ liệu chấm Face ID (đồng bộ tự động 5 phút/lần).
- Danh mục ca làm việc, ca trực; quy định giờ làm việc theo từng ca.
- Quản lý nghỉ ốm, nghỉ phép, bù trực, đi công tác, đi học tập.
- Báo cáo kết quả chấm công hàng tháng.
- Báo cáo trực, tiền trực.
- Dashboard chấm công.
- Báo cáo đi muộn, về sớm.

### 2.4. Quản lý tiền lương
- Nâng lương thường xuyên, nâng lương trước hạn, phụ cấp thâm niên vượt khung (theo tháng/năm).
- Truy lĩnh lương, phụ cấp.
- Bảng lương hàng tháng.
- Thu nhập tăng thêm (khoa đề xuất → phòng TCKT duyệt).
- Ổn định thu nhập hàng tháng (theo hệ số ổn định, hệ số quản lý, hệ số khác của từng nhân viên).

### 2.5. Quản lý thuế thu nhập cá nhân
- Khấu trừ thuế TNCN hàng tháng, người phụ thuộc, giảm trừ gia cảnh.
- Quyết toán thuế năm, chứng từ khấu trừ.

> Chức năng sẽ được bổ sung trong quá trình phát triển — luôn thiết kế theo hướng mở rộng.

---

## 3. Tech stack & Architecture

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js (App Router) + React + TypeScript + Ant Design (theme theo nhận diện BV Bạch Mai) |
| Data fetching (FE) | TanStack Query; forms: Ant Design Form + shared Zod schemas via `zodRule()` (`apps/web/src/lib/form.ts`) |
| Backend | NestJS (TypeScript) — **modular monolith** |
| Database | PostgreSQL (partition bảng dữ liệu chấm công theo tháng) |
| ORM / migration | Prisma |
| Queue / scheduler / cache | Redis + BullMQ (sync máy chấm công, sync Fast, tính lương, xuất báo cáo) |
| Excel | ExcelJS (import/export theo mẫu) |
| Auth | JWT access token ngắn hạn + refresh token (httpOnly cookie), tùy chọn 2FA (TOTP) |
| Deploy | Docker / Docker Compose, **on-premise** tại máy chủ bệnh viện |
| Mobile | Chưa có app native; web responsive + PWA cho nhân viên (xem công, đơn nghỉ) |

### 3.1. Repository layout

```
apps/
  web/                 # Next.js frontend — proxies /api/* to the API (same origin → httpOnly cookies)
  api/                 # NestJS backend (global prefix /api/v1)
  worker/              # BullMQ workers (device sync, Fast sync, payroll jobs)
packages/
  shared/              # permissions catalog, system roles, Zod schemas, money/Decimal — built to dist (CJS)
  db/                  # Prisma schema, migrations, seed; re-exports @prisma/client
  ui/                  # theme tokens (Ant Design ThemeConfig, brand colors)
docs/
  glossary.md          # thuật ngữ Việt ↔ English
  business-rules/      # quy tắc nghiệp vụ chi tiết từng module
  integrations/        # tài liệu Fast API, Hikvision ISAPI
docker/
```

### 3.2. Backend modules (`apps/api/src/modules`)

| Module | Responsibility |
|---|---|
| `auth` | login, sessions, users, user groups, RBAC, data scope |
| `org` | campuses (cơ sở), units (khoa/phòng), positions, job titles |
| `hr` | employee profile, work history, training, rewards/discipline, contracts, campus assignments |
| `attendance` | devices, raw punches, shifts, schedules, daily timesheets, monthly timesheet, late/early reports |
| `leave` | leave/business-trip/study/compensatory-duty requests + approval workflow |
| `duty` | duty rosters (lịch trực), duty pay (tiền trực) |
| `payroll` | salary components, salary raises, retroactive pay, monthly payroll, extra income, income stabilization |
| `tax` | PIT (thuế TNCN), dependants, monthly withholding, annual finalization |
| `integrations` | Fast HR adapter (`FastClient`, anti-corruption layer), source-of-truth ownership, sync logs |
| `integrations/hikvision` | Hikvision device adapter (Phase 3) |
| `catalogs` | shared lookup catalogs (positions, job titles, contract types, …) |
| `policy` | effective-dated policy parameters |
| `approvals` | multi-step approval workflow engine + inbox |
| `files` | file storage with owner-based access checks |
| `audit` | audit log |
| `common` | Prisma, guards, Zod pipe, `EncryptionService`, `ExcelService` |

Rules:
- Modules communicate through their **public service interface** or domain events — never import another module's repository/Prisma models directly.
- Business logic lives in services/domain classes, not controllers.
- Long-running work (sync, payroll calculation, big exports) runs as **BullMQ jobs**, never inside an HTTP request.

---

## 4. Nguyên tắc nghiệp vụ bắt buộc (MUST)

1. **Không hard-code chính sách.** Mọi tham số chính sách lưu trong bảng cấu hình có **ngày hiệu lực** (`effective_from`, `effective_to`):
   lương cơ sở, thang/bậc/hệ số lương, tỷ lệ phụ cấp (ưu đãi nghề, thâm niên vượt khung, độc hại, chức vụ, trách nhiệm…), mức tiền trực, biểu thuế TNCN, mức giảm trừ gia cảnh, tỷ lệ BHXH/BHYT/BHTN/KPCĐ, thời hạn nâng lương.
   Khi tính cho kỳ nào thì lấy tham số có hiệu lực tại kỳ đó (bắt buộc cho truy lĩnh).
2. **Khoản lương là danh mục cấu hình được** (salary component catalog): mỗi khoản có mã, loại (thu nhập/khấu trừ), có chịu thuế/chịu BH hay không, công thức. Thêm khoản mới không phải sửa code.
3. **Dữ liệu đã chốt thì khóa.** Bảng công tháng, bảng lương tháng sau khi chốt không được sửa; mọi điều chỉnh tạo **bản ghi điều chỉnh / truy lĩnh** ở kỳ sau.
4. **Tiền dùng `Decimal`** (Postgres `numeric(18,2)`, hệ số `numeric(6,3)`), **không bao giờ dùng float**. Quy tắc làm tròn được định nghĩa tập trung ở một chỗ (`packages/shared/money`).
5. **Mọi bảng nghiệp vụ có `campus_id`** (cơ sở) và `unit_id` khi phù hợp — phục vụ lọc, phân quyền, báo cáo theo cơ sở.
6. **Audit log** cho mọi thay đổi trên hồ sơ, lương, công, phân quyền: ai, khi nào, giá trị trước/sau, IP.
7. **Soft delete** cho dữ liệu nghiệp vụ (`deleted_at`); không xóa vật lý hồ sơ nhân sự.
8. Mọi ngày giờ lưu `timestamptz` (UTC), hiển thị theo `Asia/Ho_Chi_Minh`. Ngày công tính theo giờ Việt Nam.

### 4.1. Làm việc giữa 2 cơ sở
- Nhân viên có **cơ sở & đơn vị gốc** + bảng **phân công theo khoảng ngày** (`campus_assignments`: employee, campus, unit, from_date, to_date).
- Công được tính **theo từng ngày** và gắn với **cơ sở thực tế làm việc** (xác định từ vị trí máy quét, đối chiếu với lịch phân công).
- Báo cáo công, trực, chi phí lương phải **tách được theo cơ sở**.
- Trường hợp quét ở cơ sở không khớp phân công → đánh dấu để đơn vị xác nhận, không tự loại bỏ.

### 4.2. Ca làm việc & chấm công
- Danh mục ca/ca trực: giờ vào, giờ ra, nghỉ giữa ca, ca qua đêm, ngưỡng cho phép đi muộn/về sớm (phút), số công quy đổi.
- Lịch làm việc phân theo nhân viên/ngày; ca mặc định theo đơn vị.
- Bảng công ngày được **tính lại** từ dữ liệu quét gốc + lịch ca + đơn nghỉ đã duyệt (idempotent) cho đến khi chốt tháng.
- ⏳ CẦN BỔ SUNG: danh sách ca cụ thể và giờ làm việc từng ca.

### 4.3. Đơn nghỉ / công tác / học tập / bù trực
- **Khoa/phòng tạo phiếu** cho nhân viên, chọn **tài khoản duyệt**.
- Workflow duyệt nhiều bước, cấu hình được theo loại phiếu (ví dụ: Khoa tạo → Trưởng khoa duyệt → Phòng TCCB duyệt).
- Phiếu đã duyệt tự động tác động lên bảng công; hủy phiếu thì tính lại công.
- Theo dõi quỹ ngày phép năm của từng nhân viên.

### 4.4. Lương
- Hai hình thức lương:
  - **Lương theo hệ số**: hệ số lương × lương cơ sở (+ phụ cấp theo hệ số/tỷ lệ).
  - **Lương khoán tiền đồng**: số tiền cố định theo hợp đồng.
- **Nâng lương**: thường xuyên, trước hạn (do thành tích), thâm niên vượt khung — hệ thống tự **đề xuất danh sách đến hạn** theo tháng/năm; TCCB duyệt; quyết định có hiệu lực theo ngày.
- **Truy lĩnh**: khi quyết định có hiệu lực hồi tố, tính chênh lệch từng kỳ theo tham số có hiệu lực tại kỳ đó.
- **Thu nhập tăng thêm**: các khoa lập đề xuất thanh toán → phòng TCKT duyệt → đưa vào kỳ chi.
- **Ổn định thu nhập hàng tháng**: tính theo **hệ số ổn định, hệ số quản lý, hệ số khác** riêng của từng nhân viên (lưu có hiệu lực theo ngày).
- ⏳ CẦN BỔ SUNG: công thức chi tiết thu nhập tăng thêm, ổn định thu nhập; các mẫu bảng lương đang dùng.

### 4.5. Thuế TNCN
- Biểu thuế lũy tiến, mức giảm trừ gia cảnh, người phụ thuộc — **tất cả cấu hình theo hiệu lực** (luật thuế có thể thay đổi).
- Xác định thu nhập chịu thuế dựa trên cờ `taxable` của từng khoản lương.
- Hỗ trợ khấu trừ hàng tháng, khấu trừ 10% cho thu nhập vãng lai, quyết toán năm.

---

## 5. Phân quyền (RBAC + Data Scope)

Nhóm tài khoản mặc định:

| Nhóm | Phạm vi dữ liệu mặc định | Ghi chú |
|---|---|---|
| Admin | Toàn viện | Quản trị hệ thống, cấu hình, phân quyền |
| Phòng Tổ chức cán bộ (TCCB) | Toàn viện | Hồ sơ, công, nâng lương, duyệt đơn |
| Phòng Tài chính kế toán (TCKT) | Toàn viện | Lương, thu nhập tăng thêm, thuế |
| Trưởng khoa | Đơn vị mình phụ trách | Lập/duyệt phiếu, xem công đơn vị |
| Nhân viên | Bản thân | Xem hồ sơ, công, lương, phiếu của mình |

- Quyền = **permission** (chức năng: `hr.employee.read`, `payroll.run`…) × **data scope** (`ALL`, `CAMPUS`, `UNIT`, `SELF`).
- Một tài khoản có thể thuộc nhiều nhóm và có quyền bổ sung riêng.
- Kiểm tra quyền **ở backend** (guard + scope filter tự động vào query); frontend chỉ ẩn/hiện UI.

---

## 6. Tích hợp phần mềm Fast (nhân sự)

- Toàn bộ code nằm trong `integrations/fast` — lớp **anti-corruption**: chuyển dữ liệu Fast ↔ domain model nội bộ. Code nghiệp vụ không gọi Fast trực tiếp.
- Mỗi bản ghi đồng bộ có `source` (`FAST` | `LOCAL`) và `external_id` (mã bên Fast).
- **Source of truth cấu hình theo từng loại dữ liệu** (bảng `integration_ownership`):
  - Giai đoạn 1: Fast là nguồn chuẩn → hệ thống pull về (read-only với các trường do Fast quản lý).
  - Giai đoạn sau: chuyển dần từng module sang hệ thống mới làm nguồn chuẩn (strangler pattern), có thể đẩy ngược về Fast nếu cần.
- Đồng bộ **incremental** theo mốc thời gian thay đổi, chạy định kỳ bằng BullMQ; có log từng lần sync, báo cáo chênh lệch (reconciliation), cho phép sync lại thủ công.
- ⏳ CẦN BỔ SUNG: tài liệu API Fast (endpoint, xác thực, danh sách đối tượng dữ liệu).

---

## 7. Tích hợp máy chấm công Hikvision (Face ID)

- ~20 máy Hikvision. Hệ thống **chủ động pull** dữ liệu qua **Hikvision ISAPI** (HTTP Digest auth):
  `POST /ISAPI/AccessControl/AcsEvent?format=json` — lọc sự kiện xác thực khuôn mặt thành công, phân trang bằng `searchResultPosition`.
- Lịch: **mỗi 5 phút** (BullMQ repeatable job), mỗi máy là một job riêng.

Tối ưu & độ tin cậy:
- **Incremental**: lưu `last_serial_no` + `last_event_time` (watermark) cho từng máy; mỗi lần chỉ lấy từ watermark.
- **Overlap window** ~10 phút để không sót do lệch giờ/độ trễ ghi; **chống trùng** bằng unique `(device_id, serial_no)` + `INSERT ... ON CONFLICT DO NOTHING`.
- Pull **song song có giới hạn** (concurrency ~5), timeout ngắn, **retry exponential backoff**.
- Máy offline → lần sau tự **lấy bù (backfill)** toàn bộ khoảng thiếu từ watermark.
- **Health monitoring**: trạng thái online/offline, lần sync cuối, độ lệch đồng hồ máy so với server; cảnh báo khi máy mất kết nối > 15 phút hoặc lệch giờ > 2 phút.
- Dữ liệu quét gốc (`attendance_raw_punches`) **bất biến**, partition theo tháng; bảng công ngày tính từ bảng này.
- Mapping nhân viên ↔ `employeeNo` trên máy; quét không map được → hàng chờ xử lý.
- Mật khẩu máy lưu **mã hóa**; không log thông tin đăng nhập.
- Phương án dự phòng: nếu dùng **HikCentral** → adapter thay thế qua HikCentral OpenAPI (cùng interface `DeviceEventSource`).
- ⏳ CẦN BỔ SUNG: model máy, firmware, có dùng HikCentral hay không, sơ đồ mạng tới máy.

---

## 8. Bảo mật & tuân thủ

- Tuân thủ **Nghị định 13/2023/NĐ-CP** và **Luật Bảo vệ dữ liệu cá nhân**: dữ liệu khuôn mặt, CCCD, tài khoản ngân hàng, lương là dữ liệu nhạy cảm.
- Mã hóa cột nhạy cảm (CCCD, số tài khoản, mã số thuế…) ở tầng ứng dụng; HTTPS bắt buộc.
- **Không lưu ảnh khuôn mặt** trong hệ thống trừ khi có yêu cầu; chỉ lưu sự kiện chấm công.
- Chính sách mật khẩu, khóa tài khoản sau nhiều lần sai, timeout phiên, tùy chọn 2FA.
- Không commit secret; dùng `.env` (đã gitignore) + `.env.example`.
- Rate limiting cho API đăng nhập; validate mọi input bằng Zod/class-validator.
- Backup DB hàng ngày, lưu trữ theo chính sách bệnh viện.

---

## 9. Giao diện & nhận diện thương hiệu

Lấy theo website chính thức https://bachmai.gov.vn/:

| Token | Giá trị |
|---|---|
| Màu chính (primary) | `#008046` (xanh lá Bạch Mai) |
| Màu nhấn (accent) | `#ffc52c` (vàng) |
| Text | `#212529`, phụ `#545454` |
| Nền phụ | `#f5f5f5` |
| Font nội dung | Roboto |
| Font tiêu đề | Noto Serif |
| Logo | `https://bachmai.gov.vn/logo/logo.png` (bản mobile: `/logo/logo-mobile.png`) |
| Slogan | "Trí – Đức – Chuyên – Tâm" |

- Cấu hình qua Ant Design `ConfigProvider` theme tokens tại `packages/ui/theme`; không hard-code màu trong component.
- Hỗ trợ dark mode; responsive (desktop ưu tiên cho TCCB/TCKT, mobile cho nhân viên).
- Ngôn ngữ giao diện: **tiếng Việt** (dùng i18n để mở rộng). Định dạng số `1.234.567`, ngày `dd/MM/yyyy`.
- Bảng dữ liệu lớn (6.000 nhân sự): phân trang/virtual scroll phía server, lọc theo cơ sở/đơn vị, xuất Excel.

---

## 10. Coding conventions

- **Language**: UI text in Vietnamese; code identifiers, DB tables/columns, API paths in **English**. Look up terms in `docs/glossary.md` (e.g. truy lĩnh = `retroactive_pay`, vượt khung = `beyond_scale_seniority`, thu nhập tăng thêm = `extra_income`, ổn định thu nhập = `income_stabilization`, cơ sở = `campus`, đơn vị = `unit`, ca trực = `duty_shift`). Add new terms there when introduced.
- TypeScript `strict` everywhere; no `any` without justification.
- DB: `snake_case` tables/columns, plural table names, `id` as UUID, standard columns `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`.
- API: REST, versioned `/api/v1/...`, consistent pagination (`page`, `pageSize`) and error format; OpenAPI (Swagger) generated from NestJS.
- Shared request/response schemas live in `packages/shared` (Zod) and are used by both FE and BE.
- Migrations via Prisma only; never edit an applied migration.
- Commits: Conventional Commits (`feat(payroll): ...`).

### Testing
- **Mandatory unit tests** for all calculation logic: timesheet, late/early, duty pay, salary, raises, retroactive pay, PIT, rounding.
- Use table-driven test cases with real-world examples from hospital templates.
- Integration tests for Fast and Hikvision adapters using recorded fixtures / mock servers.
- E2E (Playwright) for critical flows: login, leave approval, monthly timesheet closing, payroll run.

---

## 11. Commands

```bash
pnpm install                     # install dependencies
pnpm --filter @bachmai/shared build  # required before api/web/seed (they consume shared/dist)
pnpm db:migrate:deploy           # apply migrations
pnpm db:generate                 # generate Prisma client
pnpm db:seed                     # permissions, 5 system roles, campuses, sample units, admin
pnpm dev                         # web :3000 + api :4000 + worker (turbo)
pnpm typecheck                   # tsc across packages
pnpm test                        # vitest unit tests
pnpm lint                        # eslint (flat config at repo root)
pnpm build                       # production build
```

Dev environment notes:
- Local Windows dev uses **native** PostgreSQL 17 (service `postgresql-x64-17`, data on `D:\PostgreSQL\17\data`) and **Memurai** (Redis-compatible). `docker/docker-compose.yml` is for Linux/servers.
- All config is in the repo-root `.env` (loaded by api, worker, web `next.config.ts`, and Prisma via `dotenv-cli`).
- `prisma migrate dev` needs an interactive terminal. In non-interactive shells generate SQL with
  `prisma migrate diff --from-empty|--from-migrations ... --to-schema-datamodel prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `pnpm db:migrate:deploy`.
- Login is rate-limited (10/min/IP) — automated tests that log in repeatedly must wait between runs.

Key backend conventions (already implemented — follow them for new modules):
- Global `AuthGuard` (JWT from `access_token` cookie, session re-validated every request) + `PermissionsGuard`. Use `@Public()`, `@RequirePermissions(...)`, `@CurrentUser()`, `@ReqMeta()` from `apps/api/src/common/auth/decorators.ts`.
- Validate input with `new ZodValidationPipe(schemaFromShared)`.
- List queries MUST include `scopeWhere(user, { campus, unit, self })` from `apps/api/src/common/auth/data-scope.ts`.
- Write + `AuditService.log(..., tx)` inside the same `prisma.$transaction`.
- New permissions: add to `packages/shared/src/constants/permissions.ts`, then `pnpm db:seed` (ADMIN gets them automatically; other system roles receive only *newly introduced* codes listed in their default definition — UI edits are never overwritten).
- New menu pages: add to `apps/web/src/lib/menu.tsx` (`comingSoon` renders a placeholder page until implemented).
- Use `@RequireAnyPermission(...)` when any one of several permissions suffices.
- **Catalogs** (`catalog_items`): business tables reference catalog items by **code** (`*_code` columns, immutable codes). New catalog type → `packages/shared/src/constants/catalogs.ts`; validate codes with `CatalogsService.assertCodes()`; seed defaults in `packages/db/prisma/seed-data.ts`.
- **Policy parameters**: never hard-code rates — read with `PolicyService.valueAt(code, date)`; definitions in `packages/shared/src/constants/policy-parameters.ts`. Effective-to is derived from the next version.
- **Sensitive fields** (CCCD, MST, bank account, TOTP secret): encrypt with `EncryptionService` (`*_enc` columns, `*_hash` blind index for uniqueness); return masked values unless the actor has `hr.sensitive.read` or it is their own record. `AuditService` strips `*_enc`/hash columns.
- **Files**: upload via `POST /files` (magic-byte check), then `FilesService.attach(fileIds, ownerType, ownerId, actor, tx)`; register a read checker per owner type with `registerAccessChecker`.
- **Approvals**: business modules call `ApprovalsService.submit(..., tx)` and listen to `APPROVAL_COMPLETED_EVENT` (`@nestjs/event-emitter`) filtered by `targetType`. Register new target types in `packages/shared/src/constants/approval.ts`.
- **Employee sub-records** (family, contracts, trainings, salaries…): one generic service `apps/api/src/modules/hr/sub-records.service.ts` configured by `SUB_RESOURCES`; schemas in `packages/shared/src/schemas/hr.ts` (`EMPLOYEE_SUB_RESOURCE_SCHEMAS` + `SUB_RECORD_RULES`). Frontend renders them with `RecordTab` + `FieldDef` lists (`apps/web/src/app/(main)/hr/employees/fields.tsx`) — add a field once, it appears in form + table.
- **Fast ownership**: before writing records that can come from Fast, call `IntegrationsService.assertWritable(entity, record.source)`.
- Date-only columns (`@db.Date`): API accepts `YYYY-MM-DD` (`dateOnlySchema`); frontend uses `toDayjs` / `fromDayjs` / `formatDay` from `apps/web/src/lib/format.ts` (avoid timezone shifts).
- `pnpm exec dotenv -e ../../.env -- prisma ...` loses the `--` separator; for ad-hoc Prisma CLI commands set `$env:DATABASE_URL` and run `pnpm exec prisma ...` directly.
- Stop `pnpm dev` before `prisma generate` / migrations on Windows (the running API locks the Prisma engine DLL).

---

## 12. Lộ trình triển khai

1. **Nền tảng**: monorepo, auth, RBAC + data scope, audit log, tổ chức (cơ sở, đơn vị), theme.
2. **Nhân sự**: hồ sơ, quá trình công tác, đào tạo, khen thưởng/kỷ luật, phân công 2 cơ sở; đồng bộ Fast (pull).
3. **Chấm công**: máy Hikvision + sync 5 phút, ca/ca trực, đơn nghỉ & workflow, bảng công, báo cáo, dashboard.
4. **Tiền lương**: danh mục khoản lương, nâng lương, truy lĩnh, bảng lương tháng, thu nhập tăng thêm, ổn định thu nhập, tiền trực.
5. **Thuế TNCN**: khấu trừ tháng, quyết toán năm.
6. **Thay thế dần Fast**: chuyển source of truth từng module.

---

## 13. ⏳ Thông tin cần bổ sung

- [ ] Tài liệu API phần mềm Fast.
- [ ] Model/firmware máy Hikvision, có HikCentral không, mạng kết nối tới máy.
- [ ] Danh sách ca làm việc, ca trực, giờ làm từng ca, ngưỡng đi muộn/về sớm.
- [ ] Mẫu báo cáo Excel đang dùng (bảng công, bảng lương, báo cáo trực, thuế).
- [ ] Công thức thu nhập tăng thêm, ổn định thu nhập, các hệ số.
- [ ] Danh sách loại hợp đồng / đối tượng lao động và cách tính lương tương ứng.
- [ ] Dữ liệu cũ cần chuyển đổi (ngoài Fast).

## 14. Working notes for Claude

- Before implementing any calculation rule, check `docs/business-rules/` — if the rule is missing or ambiguous, **ask the user** instead of guessing; hospital payroll rules are legally sensitive.
- Never hard-code legal rates or amounts; add them to the effective-dated config tables with seed data.
- Keep this file updated when architecture, commands, or business rules change.
- **Progress tracking**: `PLAN.md` is the master checklist. After finishing each task, mark it `[x]` with the completion date, update the progress summary table, and use `[~]` for in-progress and `[!]` for blocked items. Do not tick the "Nghiệm thu" column — that is for the user.
