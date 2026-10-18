import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  bulkAssignmentSchema,
  hrReportQuerySchema,
  listAssignmentsQuerySchema,
  type BulkAssignmentInput,
  type HrReportQuery,
  type ListAssignmentsQuery,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ExcelService, type ExcelColumn } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CatalogsService } from '../catalogs/catalogs.service';
import { HrReportsService } from './hr-reports.service';

/** Dòng báo cáo Prisma kèm quan hệ employee — truy cập động khi dựng cột Excel. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const d = (v: unknown) => (v ? new Date(v as string) : null);
const DATE = 'dd/mm/yyyy';
const EMP_COLS: ExcelColumn<Row>[] = [
  { header: 'Mã NV', value: (r) => r.employee.code },
  { header: 'Họ và tên', width: 26, value: (r) => r.employee.fullName },
  { header: 'Đơn vị', width: 28, value: (r) => r.employee.unit?.name },
];

@ApiTags('Nhân sự — Báo cáo')
@Controller('hr')
@RequirePermissions('hr.employee.read')
export class HrReportsController {
  constructor(
    private readonly reports: HrReportsService,
    private readonly excel: ExcelService,
    private readonly catalogs: CatalogsService,
  ) {}

  @Get('reports/trainings')
  async trainings(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(hrReportQuerySchema)) q: HrReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.trainings(actor, q, !!q.export);
    if (!q.export) return data;
    const n = await this.catalogs.nameMaps(['TRAINING_TYPE']);
    await this.sendXlsx(res, 'dao-tao', 'Đào tạo', data.items, [
      ...EMP_COLS,
      { header: 'Loại', value: (r) => n.TRAINING_TYPE.get(r.trainingTypeCode) ?? r.trainingTypeCode },
      { header: 'Khóa học / văn bằng', width: 34, value: (r) => r.name },
      { header: 'Cơ sở đào tạo', width: 26, value: (r) => r.institution },
      { header: 'Chuyên ngành', value: (r) => r.major },
      { header: 'Từ ngày', numFmt: DATE, value: (r) => d(r.fromDate) },
      { header: 'Đến ngày', numFmt: DATE, value: (r) => d(r.toDate) },
      { header: 'Số hiệu', value: (r) => r.certificateNo },
      { header: 'Hết hạn', numFmt: DATE, value: (r) => d(r.expiryDate) },
      { header: 'Số giờ', value: (r) => (r.hours ? Number(r.hours) : null) },
    ]);
  }

  @Get('reports/rewards')
  async rewards(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(hrReportQuerySchema)) q: HrReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.rewards(actor, q, !!q.export);
    if (!q.export) return data;
    const n = await this.catalogs.nameMaps(['REWARD_FORM', 'REWARD_LEVEL']);
    await this.sendXlsx(res, 'khen-thuong', 'Khen thưởng', data.items, [
      ...EMP_COLS,
      { header: 'Năm', width: 8, value: (r) => r.year },
      { header: 'Hình thức', width: 26, value: (r) => n.REWARD_FORM.get(r.formCode) ?? r.formCode },
      { header: 'Cấp', value: (r) => (r.levelCode ? (n.REWARD_LEVEL.get(r.levelCode) ?? r.levelCode) : null) },
      { header: 'Số quyết định', value: (r) => r.decisionNo },
      { header: 'Ngày quyết định', numFmt: DATE, value: (r) => d(r.decisionDate) },
      { header: 'Nội dung', width: 40, value: (r) => r.content },
      { header: 'Số tiền', numFmt: '#,##0', value: (r) => (r.amount ? Number(r.amount) : null) },
    ]);
  }

  @Get('reports/disciplines')
  async disciplines(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(hrReportQuerySchema)) q: HrReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.disciplines(actor, q, !!q.export);
    if (!q.export) return data;
    const n = await this.catalogs.nameMaps(['DISCIPLINE_FORM']);
    await this.sendXlsx(res, 'ky-luat', 'Kỷ luật', data.items, [
      ...EMP_COLS,
      { header: 'Hình thức', value: (r) => n.DISCIPLINE_FORM.get(r.formCode) ?? r.formCode },
      { header: 'Số quyết định', value: (r) => r.decisionNo },
      { header: 'Hiệu lực từ', numFmt: DATE, value: (r) => d(r.effectiveFrom) },
      { header: 'Đến', numFmt: DATE, value: (r) => d(r.effectiveTo) },
      { header: 'Kéo dài nâng lương (tháng)', value: (r) => r.delayRaiseMonths },
      { header: 'Lý do', width: 40, value: (r) => r.reason },
    ]);
  }

  @Get('reports/contracts-expiring')
  async contracts(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(hrReportQuerySchema)) q: HrReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.expiringContracts(actor, q, !!q.export);
    if (!q.export) return data;
    const n = await this.catalogs.nameMaps(['CONTRACT_TYPE']);
    await this.sendXlsx(res, 'hop-dong-sap-het-han', 'Hợp đồng sắp hết hạn', data.items, [
      ...EMP_COLS,
      { header: 'Số hợp đồng', value: (r) => r.contractNo },
      { header: 'Loại', width: 30, value: (r) => n.CONTRACT_TYPE.get(r.contractTypeCode) ?? r.contractTypeCode },
      { header: 'Từ ngày', numFmt: DATE, value: (r) => d(r.startDate) },
      { header: 'Đến ngày', numFmt: DATE, value: (r) => d(r.endDate) },
    ]);
  }

  @Get('assignments')
  async assignments(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listAssignmentsQuerySchema.extend(hrReportQuerySchema.pick({ export: true }).shape))) q: ListAssignmentsQuery & { export?: 'xlsx' }, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.assignments(actor, q, !!q.export);
    if (!q.export) return data;
    await this.sendXlsx(res, `phan-cong-co-so${q.month ? `-${q.month}` : ''}`, 'Phân công cơ sở', data.items as Row[], [
      ...EMP_COLS,
      { header: 'Cơ sở gốc', value: (r) => r.employee.campus?.name },
      { header: 'Cơ sở được phân công', value: (r) => r.campus?.name },
      { header: 'Đơn vị làm việc', width: 26, value: (r) => r.unit?.name },
      { header: 'Từ ngày', numFmt: DATE, value: (r) => d(r.fromDate) },
      { header: 'Đến ngày', numFmt: DATE, value: (r) => d(r.toDate) },
      { header: 'Số quyết định', value: (r) => r.decisionNo },
      { header: 'Ghi chú', width: 30, value: (r) => r.note },
    ]);
  }

  @Post('assignments/bulk')
  @RequirePermissions('hr.employee.read', 'hr.assignment.manage')
  bulkAssign(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(bulkAssignmentSchema)) body: BulkAssignmentInput, @ReqMeta() meta: RequestMeta) {
    return this.reports.bulkAssign(actor, body, meta);
  }

  private async sendXlsx(res: Response, file: string, sheet: string, rows: Row[], columns: ExcelColumn<Row>[]) {
    const buf = await this.excel.build([{ name: sheet, rows, columns }]);
    this.excel.send(res, `${file}-${new Date().toISOString().slice(0, 10)}.xlsx`, buf);
  }
}
