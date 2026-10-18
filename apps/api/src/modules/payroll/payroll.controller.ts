import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  COMPONENT_KINDS,
  createComponentSchema,
  createExtraIncomeSchema,
  createRaisesSchema,
  createRunSchema,
  createScaleSchema,
  decideRaisesSchema,
  listExtraIncomeQuerySchema,
  listRaisesQuerySchema,
  listRunItemsQuerySchema,
  pitBracketsSchema,
  raiseDueQuerySchema,
  testFormulaSchema,
  updateComponentSchema,
  updateScaleSchema,
  uuidSchema,
  ymdOf,
  type CreateComponentInput,
  type CreateExtraIncomeInput,
  type CreateRaisesInput,
  type CreateRunInput,
  type CreateScaleInput,
  type DecideRaisesInput,
  type ListExtraIncomeQuery,
  type ListRaisesQuery,
  type ListRunItemsQuery,
  type PitBracketsInput,
  type RaiseDueQuery,
  type UpdateComponentInput,
  type UpdateScaleInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { ExcelService, type ExcelColumn } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExtraIncomeService } from './extra-income.service';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollRunsService } from './payroll-runs.service';
import { RetroPayService } from './retro-pay.service';
import { RAISE_KIND_LABELS, SalaryRaisesService } from './salary-raises.service';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM');
const previewSchema = z.object({ employeeId: uuidSchema, month });
const recomputeRetroSchema = z.object({ employeeId: uuidSchema, fromMonth: month });
const MONEY = '#,##0';
const fmtDate = (d: Date | null | undefined) => (d ? ymdOf(d).split('-').reverse().join('/') : '');

@ApiTags('Tiền lương')
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly config: PayrollConfigService,
    private readonly runs: PayrollRunsService,
    private readonly raises: SalaryRaisesService,
    private readonly retro: RetroPayService,
    private readonly extra: ExtraIncomeService,
    private readonly excel: ExcelService,
    private readonly crypto: EncryptionService,
  ) {}

  // ================= CẤU HÌNH =================

  @Get('components')
  @RequireAnyPermission('payroll.config.manage', 'payroll.read', 'payroll.run')
  components() {
    return this.config.components();
  }

  @Get('variables')
  @RequireAnyPermission('payroll.config.manage', 'payroll.read')
  variables() {
    return this.config.variables();
  }

  @Post('components')
  @RequirePermissions('payroll.config.manage')
  createComponent(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createComponentSchema)) body: CreateComponentInput, @ReqMeta() meta: RequestMeta) {
    return this.config.createComponent(actor, body, meta);
  }

  @Patch('components/:id')
  @RequirePermissions('payroll.config.manage')
  updateComponent(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateComponentSchema)) body: UpdateComponentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updateComponent(actor, id, body, meta);
  }

  @Post('formula/test')
  @HttpCode(200)
  @RequirePermissions('payroll.config.manage')
  testFormula(@Body(new ZodValidationPipe(testFormulaSchema)) body: { formula: string; employeeId?: string; month?: string }) {
    return this.config.testFormula(body.formula, body.employeeId, body.month);
  }

  @Get('preview')
  @RequireAnyPermission('payroll.config.manage', 'payroll.run')
  preview(@Query(new ZodValidationPipe(previewSchema)) q: { employeeId: string; month: string }) {
    return this.config.preview(q.employeeId, q.month);
  }

  @Get('scales')
  @RequireAnyPermission('payroll.config.manage', 'payroll.raise.manage', 'hr.salary.read')
  scales() {
    return this.config.scales();
  }

  @Post('scales')
  @RequirePermissions('payroll.config.manage')
  createScale(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createScaleSchema)) body: CreateScaleInput, @ReqMeta() meta: RequestMeta) {
    return this.config.createScale(actor, body, meta);
  }

  @Patch('scales/:id')
  @RequirePermissions('payroll.config.manage')
  updateScale(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateScaleSchema)) body: UpdateScaleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updateScale(actor, id, body, meta);
  }

  @Get('pit-brackets')
  @RequireAnyPermission('payroll.config.manage', 'payroll.read', 'tax.manage')
  pitVersions() {
    return this.config.pitVersions();
  }

  @Post('pit-brackets')
  @RequireAnyPermission('payroll.config.manage', 'tax.manage')
  addPit(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(pitBracketsSchema)) body: PitBracketsInput, @ReqMeta() meta: RequestMeta) {
    return this.config.addPitVersion(actor, body, meta);
  }

  // ================= KỲ LƯƠNG =================

  @Get('runs')
  @RequireAnyPermission('payroll.read', 'payroll.run')
  listRuns() {
    return this.runs.list();
  }

  @Post('runs')
  @RequirePermissions('payroll.run')
  createRun(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createRunSchema)) body: CreateRunInput, @ReqMeta() meta: RequestMeta) {
    return this.runs.create(actor, body, meta);
  }

  @Get('runs/:id')
  @RequireAnyPermission('payroll.read', 'payroll.run')
  getRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.runs.get(id);
  }

  @Delete('runs/:id')
  @RequirePermissions('payroll.run')
  async removeRun(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.runs.remove(actor, id, meta);
    return { ok: true };
  }

  @Post('runs/:id/calculate')
  @HttpCode(200)
  @RequirePermissions('payroll.run')
  calculate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.runs.enqueueCalculate(actor, id, meta);
  }

  @Post('runs/:id/close')
  @HttpCode(200)
  @RequirePermissions('payroll.close')
  close(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.runs.close(actor, id, meta);
  }

  @Get('runs/:id/items')
  @RequireAnyPermission('payroll.read', 'payroll.run')
  items(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(listRunItemsQuerySchema)) q: ListRunItemsQuery) {
    return this.runs.items(id, q);
  }

  @Get('runs/:id/summary')
  @RequireAnyPermission('payroll.read', 'payroll.run')
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.runs.summary(id);
  }

  @Get('runs/:id/export')
  @RequireAnyPermission('payroll.read', 'payroll.run')
  async exportRun(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { run, items, comps } = await this.runs.exportRows(id);
    type Row = (typeof items)[number];
    const amount = (r: Row, code: string) => {
      const l = r.lines.find((x) => x.code === code);
      return l ? Number(l.amount) : null;
    };
    const columns: ExcelColumn<Row>[] = [
      { header: 'Mã NV', width: 11, value: (r) => r.employee.code },
      { header: 'Họ tên', width: 26, value: (r) => r.employee.fullName },
      { header: 'Đơn vị', width: 26, value: (r) => r.employee.unit.name },
      { header: 'Hệ số', width: 8, value: (r) => Number((r.inputs as Record<string, string>).COEF ?? 0) || null, numFmt: '0.000' },
      { header: 'Ngày công', width: 9, value: (r) => Number((r.inputs as Record<string, string>).WORK_UNITS ?? 0) },
      ...comps.map((c) => ({ header: c.name, width: 14, value: (r: Row) => amount(r, c.code), numFmt: MONEY })),
      { header: 'Tổng thu nhập', width: 15, value: (r) => Number(r.gross), numFmt: MONEY },
      { header: 'Tổng khấu trừ', width: 15, value: (r) => Number(r.deductions), numFmt: MONEY },
      { header: 'Thực lĩnh', width: 15, value: (r) => Number(r.net), numFmt: MONEY },
      { header: 'Ghi chú', width: 40, value: (r) => ((r.errors as string[] | null) ?? []).join('; ') },
    ];
    const buf = await this.excel.build([{ name: `Bảng lương ${run.month}`, rows: items, columns }]);
    this.excel.send(res, `bang-luong-${run.month}.xlsx`, buf);
  }

  /** Danh sách chuyển khoản ngân hàng (giải mã số tài khoản — chỉ người có quyền chốt / xem dữ liệu nhạy cảm) */
  @Get('runs/:id/bank-export')
  @RequirePermissions('payroll.close', 'hr.sensitive.read')
  async bankExport(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { run, items } = await this.runs.exportRows(id);
    if (run.status !== 'CLOSED') throw new BadRequestException('Chỉ xuất danh sách chuyển khoản cho kỳ lương đã chốt');
    const rows = items
      .filter((i) => Number(i.net) > 0)
      .map((i) => ({ ...i.employee, account: this.crypto.decrypt(i.employee.bankAccountEnc) ?? '', net: Number(i.net) }));
    type Row = (typeof rows)[number];
    const columns: ExcelColumn<Row>[] = [
      { header: 'Mã NV', width: 11, value: (r) => r.code },
      { header: 'Họ tên', width: 26, value: (r) => r.fullName },
      { header: 'Số tài khoản', width: 20, value: (r) => r.account },
      { header: 'Ngân hàng', width: 14, value: (r) => r.bankCode },
      { header: 'Chi nhánh', width: 22, value: (r) => r.bankBranch },
      { header: 'Số tiền', width: 15, value: (r) => r.net, numFmt: MONEY },
      { header: 'Nội dung', width: 30, value: () => `Luong thang ${run.month.split('-').reverse().join('/')}` },
    ];
    const buf = await this.excel.build([{ name: 'Chuyển khoản', rows, columns }]);
    this.excel.send(res, `chuyen-khoan-${run.month}.xlsx`, buf);
  }

  @Get('items/:id')
  @RequireAnyPermission('payroll.read', 'self.payslip.read')
  item(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.runs.item(actor, id);
  }

  @Get('payslips/me')
  @RequirePermissions('self.payslip.read')
  myPayslips(@CurrentUser() actor: AuthUser) {
    return this.runs.myPayslips(actor);
  }

  // ================= NÂNG LƯƠNG =================

  @Get('raises/due')
  @RequirePermissions('payroll.raise.manage')
  due(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(raiseDueQuerySchema)) q: RaiseDueQuery) {
    return this.raises.due(actor, q);
  }

  @Get('raises')
  @RequirePermissions('payroll.raise.manage')
  async listRaises(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listRaisesQuerySchema)) q: ListRaisesQuery, @Res({ passthrough: true }) res: Response) {
    if (q.export !== 'xlsx') return this.raises.list(actor, q);
    const rows = await this.raises.exportRows(actor, q);
    type Row = (typeof rows)[number];
    const STATUS = { PROPOSED: 'Đề xuất', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' } as const;
    const columns: ExcelColumn<Row>[] = [
      { header: 'Mã NV', width: 11, value: (r) => r.employee.code },
      { header: 'Họ tên', width: 26, value: (r) => r.employee.fullName },
      { header: 'Đơn vị', width: 26, value: (r) => r.employee.unit.name },
      { header: 'Loại', width: 22, value: (r) => RAISE_KIND_LABELS[r.kind] },
      { header: 'Bậc cũ', width: 7, value: (r) => r.fromStep },
      { header: 'Hệ số cũ', width: 9, value: (r) => Number(r.fromCoefficient ?? 0) || null, numFmt: '0.000' },
      { header: 'VK cũ (%)', width: 9, value: (r) => Number(r.fromBeyondPct ?? 0) || null },
      { header: 'Bậc mới', width: 7, value: (r) => r.toStep },
      { header: 'Hệ số mới', width: 9, value: (r) => Number(r.toCoefficient ?? 0) || null, numFmt: '0.000' },
      { header: 'VK mới (%)', width: 9, value: (r) => Number(r.toBeyondPct ?? 0) || null },
      { header: 'Đến hạn', width: 11, value: (r) => fmtDate(r.dueDate) },
      { header: 'Hiệu lực', width: 11, value: (r) => fmtDate(r.effectiveDate) },
      { header: 'Trạng thái', width: 11, value: (r) => STATUS[r.status] },
      { header: 'Số QĐ', width: 14, value: (r) => r.decisionNo },
      { header: 'Lý do', width: 30, value: (r) => r.reason },
    ];
    const buf = await this.excel.build([{ name: 'Nâng lương', rows, columns }]);
    this.excel.send(res, 'nang-luong.xlsx', buf);
  }

  @Post('raises')
  @RequirePermissions('payroll.raise.manage')
  createRaises(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createRaisesSchema)) body: CreateRaisesInput, @ReqMeta() meta: RequestMeta) {
    return this.raises.create(actor, body, meta);
  }

  @Post('raises/decide')
  @HttpCode(200)
  @RequirePermissions('payroll.raise.manage', 'hr.salary.manage')
  decideRaises(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(decideRaisesSchema)) body: DecideRaisesInput, @ReqMeta() meta: RequestMeta) {
    return this.raises.decide(actor, body, meta);
  }

  @Delete('raises/:id')
  @RequirePermissions('payroll.raise.manage')
  async removeRaise(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.raises.remove(actor, id, meta);
    return { ok: true };
  }

  // ================= TRUY LĨNH =================

  @Get('retro')
  @RequireAnyPermission('payroll.retro.manage', 'payroll.run')
  listRetro(@Query('status') status?: string) {
    const s = z.enum(['PENDING', 'INCLUDED', 'CANCELLED']).optional().parse(status || undefined);
    return this.retro.list(s);
  }

  @Get('retro/:id')
  @RequireAnyPermission('payroll.retro.manage', 'payroll.run')
  getRetro(@Param('id', ParseUUIDPipe) id: string) {
    return this.retro.get(id);
  }

  @Post('retro/recompute')
  @HttpCode(200)
  @RequirePermissions('payroll.retro.manage')
  recomputeRetro(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(recomputeRetroSchema)) body: { employeeId: string; fromMonth: string }, @ReqMeta() meta: RequestMeta) {
    return this.retro.manualRecompute(actor, body.employeeId, body.fromMonth, meta);
  }

  @Post('retro/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('payroll.retro.manage')
  cancelRetro(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.retro.cancel(actor, id, meta);
  }

  // ================= THU NHẬP TĂNG THÊM =================

  @Get('extra-income')
  @RequireAnyPermission('payroll.extra_income.propose', 'payroll.extra_income.approve', 'payroll.read')
  listExtra(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listExtraIncomeQuerySchema)) q: ListExtraIncomeQuery) {
    return this.extra.list(actor, q);
  }

  @Get('extra-income/template')
  @RequirePermissions('payroll.extra_income.propose')
  async extraTemplate(@Res() res: Response) {
    this.excel.send(res, 'mau-thu-nhap-tang-them.xlsx', await this.extra.template());
  }

  @Post('extra-income/parse')
  @HttpCode(200)
  @RequirePermissions('payroll.extra_income.propose')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  parseExtra(@CurrentUser() actor: AuthUser, @Query('unitId', ParseUUIDPipe) unitId: string, @UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Chọn file Excel');
    return this.extra.parseLines(actor, unitId, file.buffer);
  }

  @Get('extra-income/:id')
  @RequireAnyPermission('payroll.extra_income.propose', 'payroll.extra_income.approve', 'payroll.read')
  getExtra(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.extra.get(actor, id);
  }

  @Post('extra-income')
  @RequirePermissions('payroll.extra_income.propose')
  createExtra(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createExtraIncomeSchema)) body: CreateExtraIncomeInput, @ReqMeta() meta: RequestMeta) {
    return this.extra.create(actor, body, meta);
  }

  @Post('extra-income/:id/cancel')
  @HttpCode(200)
  @RequireAnyPermission('payroll.extra_income.propose', 'payroll.extra_income.approve')
  cancelExtra(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.extra.cancel(actor, id, meta);
  }

  @Get('component-kinds')
  kinds() {
    return COMPONENT_KINDS;
  }
}
