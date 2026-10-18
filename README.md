# HRM Bệnh viện Bạch Mai

Hệ thống Quản lý Nhân sự – Chấm công – Tiền lương – Thuế TNCN cho Bệnh viện Bạch Mai (cơ sở Hà Nội & Ninh Bình).

- Kiến trúc, quy ước: [CLAUDE.md](CLAUDE.md)
- Kế hoạch & tiến độ: [PLAN.md](PLAN.md)
- Thuật ngữ: [docs/glossary.md](docs/glossary.md) · Quy tắc nghiệp vụ: [docs/business-rules/](docs/business-rules/)

## Yêu cầu

- Node.js ≥ 22, pnpm 9
- PostgreSQL 17 (cổng 5432), Redis / Memurai (cổng 6379)
  — hoặc `docker compose -f docker/docker-compose.yml up -d`

## Cài đặt lần đầu

```powershell
pnpm install
copy .env.example .env        # sửa DATABASE_URL, JWT_ACCESS_SECRET, SEED_ADMIN_PASSWORD
pnpm --filter @bachmai/shared build
pnpm db:migrate:deploy        # tạo bảng
pnpm db:generate
pnpm db:seed                  # quyền, 5 nhóm tài khoản, 2 cơ sở, đơn vị mẫu, tài khoản admin
```

## Chạy

```powershell
pnpm dev
```

| Dịch vụ | Địa chỉ |
|---|---|
| Web | http://localhost:3000 |
| API | http://127.0.0.1:4000/api/v1 |
| Swagger | http://127.0.0.1:4000/api/docs |
| Health | http://127.0.0.1:4000/api/v1/health |

Đăng nhập lần đầu: tài khoản `admin`, mật khẩu = `SEED_ADMIN_PASSWORD` trong `.env` → hệ thống bắt buộc đổi mật khẩu.

## Lệnh khác

```powershell
pnpm typecheck     # kiểm tra kiểu toàn bộ
pnpm test          # unit test
pnpm lint          # ESLint
pnpm build         # build production
pnpm db:migrate    # tạo migration mới khi sửa schema.prisma (chạy trong terminal tương tác)
pnpm db:studio     # xem dữ liệu
```
