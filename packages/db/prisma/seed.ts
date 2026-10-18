import { hash } from '@node-rs/argon2';
import { PrismaClient, UnitType } from '@prisma/client';
import { DEFAULT_COMPONENTS, DEFAULT_JOB_TITLE_SCALE, DEFAULT_PIT_BRACKETS, DEFAULT_SALARY_SCALES, INTEGRATION_ENTITIES, PERMISSIONS, SYSTEM_ROLES } from '@bachmai/shared';
import { CATALOG_SEED, HOLIDAY_SEED, LEAVE_TYPE_SEED, POLICY_SEED, SHIFT_SEED } from './seed-data';

const prisma = new PrismaClient();

const CAMPUSES = [
  {
    code: 'HN',
    name: 'Cơ sở Hà Nội',
    address: '78 Giải Phóng, Phương Mai, Đống Đa, Hà Nội',
    sortOrder: 1,
  },
  { code: 'NB', name: 'Cơ sở Ninh Bình', address: 'Ninh Bình', sortOrder: 2 },
];

/** Đơn vị mẫu ban đầu — danh sách đầy đủ ~60 đơn vị sẽ import từ Fast / Excel. */
const SAMPLE_UNITS: { code: string; name: string; type: UnitType }[] = [
  { code: 'P.TCCB', name: 'Phòng Tổ chức cán bộ', type: 'PHONG' },
  { code: 'P.TCKT', name: 'Phòng Tài chính kế toán', type: 'PHONG' },
  { code: 'P.KHTH', name: 'Phòng Kế hoạch tổng hợp', type: 'PHONG' },
  { code: 'P.DD', name: 'Phòng Điều dưỡng', type: 'PHONG' },
  { code: 'P.HCQT', name: 'Phòng Hành chính quản trị', type: 'PHONG' },
  { code: 'TT.CNTT', name: 'Trung tâm Công nghệ thông tin', type: 'TRUNG_TAM' },
  { code: 'TT.TM', name: 'Viện Tim mạch Việt Nam', type: 'VIEN' },
  { code: 'TT.CD', name: 'Trung tâm Chống độc', type: 'TRUNG_TAM' },
  { code: 'K.CCA9', name: 'Trung tâm Cấp cứu A9', type: 'TRUNG_TAM' },
  { code: 'K.HSTC', name: 'Khoa Hồi sức tích cực', type: 'KHOA' },
];

/** Upsert danh mục quyền; trả về các mã quyền MỚI xuất hiện lần này. */
async function seedPermissions(): Promise<Set<string>> {
  const existing = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, name: p.name },
      create: { code: p.code, module: p.module, name: p.name },
    });
  }
  const added = new Set(PERMISSIONS.map((p) => p.code).filter((c) => !existing.has(c)));
  console.log(`✔ ${PERMISSIONS.length} quyền (${added.size} quyền mới)`);
  return added;
}

/**
 * Nhóm hệ thống: tạo nếu chưa có. Nhóm đã tồn tại KHÔNG bị ghi đè quyền đã chỉnh trên giao diện —
 * chỉ được bổ sung những quyền mới xuất hiện lần này theo định nghĩa mặc định. ADMIN luôn đủ quyền.
 */
async function seedRoles(newPermissions: Set<string>) {
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: r.code } });
    if (!existing) {
      await prisma.role.create({
        data: {
          code: r.code,
          name: r.name,
          description: r.description,
          dataScope: r.dataScope,
          isSystem: true,
          permissions: { create: r.permissions.map((code) => ({ permissionCode: code })) },
        },
      });
      continue;
    }
    const toAdd = r.code === 'ADMIN' ? r.permissions : r.permissions.filter((c) => newPermissions.has(c));
    if (toAdd.length) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((code) => ({ roleId: existing.id, permissionCode: code })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`✔ ${SYSTEM_ROLES.length} nhóm tài khoản`);
}

async function seedOrg() {
  for (const c of CAMPUSES) {
    await prisma.campus.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  const hn = await prisma.campus.findUniqueOrThrow({ where: { code: 'HN' } });
  for (const [i, u] of SAMPLE_UNITS.entries()) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: {},
      create: { ...u, campusId: u.type === 'PHONG' ? null : hn.id, sortOrder: i + 1 },
    });
  }
  console.log(`✔ ${CAMPUSES.length} cơ sở, ${SAMPLE_UNITS.length} đơn vị mẫu`);
}

/** Danh mục: chỉ thêm mục chưa có — không ghi đè chỉnh sửa trên giao diện. */
async function seedCatalogs() {
  let count = 0;
  for (const [type, items] of Object.entries(CATALOG_SEED)) {
    const r = await prisma.catalogItem.createMany({
      data: items.map((it, i) => ({ type, code: it.code, name: it.name, meta: it.meta, sortOrder: i + 1 })),
      skipDuplicates: true,
    });
    count += r.count;
  }
  console.log(`✔ Danh mục: thêm ${count} mục`);
}

async function seedPolicy() {
  const r = await prisma.policyParameter.createMany({
    data: POLICY_SEED.map((p) => ({ ...p, effectiveFrom: new Date(`${p.effectiveFrom}T00:00:00Z`) })),
    skipDuplicates: true,
  });
  console.log(`✔ Tham số chính sách: thêm ${r.count} phiên bản`);
}

async function seedWorkflows() {
  const tccb = await prisma.role.findUniqueOrThrow({ where: { code: 'TCCB' } });
  const defs = [
    {
      code: 'LEAVE_DEFAULT',
      name: 'Duyệt phiếu nghỉ, công tác (mặc định)',
      targetType: 'LEAVE_REQUEST',
      steps: [
        { stepOrder: 1, name: 'Người được chọn duyệt', approverType: 'SELECTED' as const, roleId: null },
        { stepOrder: 2, name: 'Phòng Tổ chức cán bộ', approverType: 'ROLE' as const, roleId: tccb.id },
      ],
    },
    {
      code: 'GENERAL_DEFAULT',
      name: 'Tờ trình chung',
      targetType: 'GENERAL',
      steps: [{ stepOrder: 1, name: 'Người được chọn duyệt', approverType: 'SELECTED' as const, roleId: null }],
    },
  ];
  for (const d of defs) {
    const exists = await prisma.approvalWorkflow.findUnique({ where: { code: d.code } });
    if (exists) continue;
    await prisma.approvalWorkflow.create({
      data: { code: d.code, name: d.name, targetType: d.targetType, steps: { create: d.steps } },
    });
  }
  console.log(`✔ ${defs.length} quy trình duyệt mẫu`);
}

async function seedIntegration() {
  await prisma.integrationOwnership.createMany({
    data: Object.keys(INTEGRATION_ENTITIES).map((entity) => ({ entity, source: 'FAST' as const })),
    skipDuplicates: true,
  });
  console.log('✔ Cấu hình nguồn dữ liệu chuẩn (mặc định: Fast)');
}

async function seedAttendance() {
  const shifts = await prisma.shift.createMany({
    data: SHIFT_SEED.map((x, i) => ({ ...x, workUnits: x.workUnits, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
  const types = await prisma.leaveType.createMany({
    data: LEAVE_TYPE_SEED.map((x, i) => ({ ...x, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
  const holidays = await prisma.holiday.createMany({
    data: HOLIDAY_SEED.map((h) => ({ ...h, date: new Date(`${h.date}T00:00:00Z`) })),
    skipDuplicates: true,
  });
  console.log(`✔ Chấm công: thêm ${shifts.count} ca, ${types.count} loại phiếu, ${holidays.count} ngày lễ`);
}

async function seedPayroll() {
  const comps = await prisma.salaryComponent.createMany({
    data: DEFAULT_COMPONENTS.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 })),
    skipDuplicates: true,
  });
  let scales = 0;
  for (const sc of DEFAULT_SALARY_SCALES) {
    if (await prisma.salaryScale.findUnique({ where: { code: sc.code } })) continue;
    await prisma.salaryScale.create({
      data: {
        code: sc.code,
        name: sc.name,
        raiseIntervalMonths: sc.raiseIntervalMonths,
        steps: { create: sc.coefficients.map((coefficient, i) => ({ step: i + 1, coefficient })) },
      },
    });
    scales++;
  }
  // Gán thang lương cho chức danh nghề nghiệp mẫu (không ghi đè nếu đã có)
  for (const [code, scale] of Object.entries(DEFAULT_JOB_TITLE_SCALE)) {
    const item = await prisma.catalogItem.findUnique({ where: { type_code: { type: 'JOB_TITLE', code } } });
    const meta = (item?.meta ?? {}) as Record<string, unknown>;
    if (item && !meta.salaryScale) await prisma.catalogItem.update({ where: { id: item.id }, data: { meta: { ...meta, salaryScale: scale } } });
  }
  await prisma.pitBracketVersion.createMany({
    data: [{ effectiveFrom: new Date('2013-07-01T00:00:00Z'), brackets: DEFAULT_PIT_BRACKETS, legalBasis: 'Luật Thuế TNCN sửa đổi 2012 — biểu lũy tiến 7 bậc (⚠ TCKT cập nhật nếu có biểu mới)' }],
    skipDuplicates: true,
  });
  const tckt = await prisma.role.findUniqueOrThrow({ where: { code: 'TCKT' } });
  if (!(await prisma.approvalWorkflow.findUnique({ where: { code: 'EXTRA_INCOME_DEFAULT' } }))) {
    await prisma.approvalWorkflow.create({
      data: {
        code: 'EXTRA_INCOME_DEFAULT',
        name: 'Duyệt đề xuất thu nhập tăng thêm',
        targetType: 'EXTRA_INCOME',
        steps: { create: [{ stepOrder: 1, name: 'Phòng Tài chính kế toán', approverType: 'ROLE', roleId: tckt.id }] },
      },
    });
  }
  console.log(`✔ Tiền lương: thêm ${comps.count} khoản lương, ${scales} thang lương, biểu thuế TNCN, quy trình thu nhập tăng thêm`);
}

async function seedAdmin() {
  const username = (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Thiếu SEED_ADMIN_PASSWORD trong .env');

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    console.log(`• Tài khoản ${username} đã tồn tại — bỏ qua`);
    return;
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  await prisma.user.create({
    data: {
      username,
      fullName: 'Quản trị hệ thống',
      passwordHash: await hash(password),
      mustChangePassword: true,
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });
  console.log(`✔ Tài khoản quản trị: ${username} (bắt buộc đổi mật khẩu lần đầu)`);
}

async function main() {
  const newPermissions = await seedPermissions();
  await seedRoles(newPermissions);
  await seedOrg();
  await seedCatalogs();
  await seedPolicy();
  await seedWorkflows();
  await seedIntegration();
  await seedAttendance();
  await seedPayroll();
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
