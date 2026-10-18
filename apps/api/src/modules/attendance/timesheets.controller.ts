import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  adjustTimesheetSchema,
  applySchedulePatternSchema,
  attendanceReportQuerySchema,
  copyScheduleWeekSchema,
  periodActionSchema,
  recomputeSchema,
  scheduleGridQuerySchema,
  setScheduleCellsSchema,
  timesheetQuerySchema,
  TIMESHEET_STATUSES,
  type AdjustTimesheetInput,
  type ApplySchedulePatternInput,
  type AttendanceReportQuery,
  type CopyScheduleWeekInput,
  type PeriodActionInput,
  type ScheduleGridQuery,
  type SetScheduleCellsInput,
  type TimesheetQuery,
  type TimesheetStatus,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { ExcelService, type ExcelColumn } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AttendanceReportsService } from './attendance-reports.service';
import { SchedulesService } from './schedules.service';
import { TimesheetService } from './timesheet.service';

const month = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });
const vnTime = (d: Date | string | null) => (d ? new Date(new Date(d).getTime() + 7 * 3_600_000).toISOString().slice(11, 16) : null);

@ApiTags('Chấm công — Lịch, bảng công, báo cáo')
@Controller('attendance')
export class TimesheetsController {
  constructor(
    private readonly timesheet: TimesheetService,
    private readonly schedules: SchedulesService,
    private readonly reports: AttendanceReportsService,
    private readonly excel: ExcelService,
  ) {}

  // ================= LỊCH =================

  @Get('schedules')
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage', 'attendance.timesheet.read')
  grid(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(scheduleGridQuerySchema)) q: ScheduleGridQuery) {
    return this.schedules.grid(actor, q.unitId, q.month, q.shiftType);
  }

  @Post('schedules/cells')
  @HttpCode(200)
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage')
  setCells(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(setScheduleCellsSchema)) body: SetScheduleCellsInput, @ReqMeta() meta: RequestMeta) {
    return this.schedules.setCells(actor, body, meta);
  }

  @Post('schedules/pattern')
  @HttpCode(200)
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage')
  pattern(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(applySchedulePatternSchema)) body: ApplySchedulePatternInput, @ReqMeta() meta: RequestMeta) {
    return this.schedules.applyPattern(actor, body, meta);
  }

  @Post('schedules/copy-week')
  @HttpCode(200)
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage')
  copyWeek(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(copyScheduleWeekSchema)) body: CopyScheduleWeekInput, @ReqMeta() meta: RequestMeta) {
    return this.schedules.copyWeek(actor, body, meta);
  }

  @Get('schedules/export')
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage', 'attendance.timesheet.read')
  async exportSchedules(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(scheduleGridQuerySchema)) q: ScheduleGridQuery, @Res() res: Response) {
    const buf = await this.schedules.exportXlsx(actor, q.unitId, q.month, q.shiftType);
    this.excel.send(res, `${q.shiftType === 'DUTY' ? 'lich-truc' : 'lich-lam-viec'}-${q.month}.xlsx`, buf);
  }

  @Post('schedules/import')
  @HttpCode(200)
  @RequireAnyPermission('attendance.schedule.manage', 'duty.roster.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  importSchedules(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(scheduleGridQuerySchema)) q: ScheduleGridQuery,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.schedules.importXlsx(actor, q.unitId, q.month, q.shiftType, file?.buffer, meta);
  }

  // ================= BẢNG CÔNG =================

  @Get('timesheets')
  @RequirePermissions('attendance.timesheet.read')
  async timesheets(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(timesheetQuerySchema)) q: TimesheetQuery, @Res({ passthrough: true }) res: Response) {
    const g = await this.timesheet.grid(actor, q.unitId, q.month);
    if (!q.export) return g;
    type E = (typeof g.employees)[number];
    const count = (e: E, ...symbols: string[]) => symbols.reduce((s, x) => s + (e.totals.bySymbol[x] ?? 0), 0);
    const columns: ExcelColumn<E>[] = [
      { header: 'Mã NV', value: (e) => e.code },
      { header: 'Họ và tên', width: 26, value: (e) => e.fullName },
      ...g.days.map((d) => ({
        header: d.slice(8),
        width: 5,
        value: (e: E) => e.cells.filter((c) => c.date === d).map((c) => c.symbol).join('+') || null,
      })),
      { header: 'Tổng công', width: 10, value: (e) => Number(e.totals.workUnits) },
      ...g.campuses.map((c) => ({ header: `Công ${c.code}`, width: 9, value: (e: E) => Number(e.totals.unitsByCampus[c.id] ?? 0) || null })),
      { header: 'Trực', width: 7, value: (e) => e.totals.dutyCount || null },
      { header: 'Phép', width: 7, value: (e) => count(e, 'P') || null },
      { header: 'Ốm', width: 7, value: (e) => count(e, 'Ô', 'CÔ') || null },
      { header: 'Công tác/Học', width: 9, value: (e) => count(e, 'CT', 'H') || null },
      { header: 'Vắng (K)', width: 8, value: (e) => e.totals.absentCount || null },
      { header: 'Muộn (lần)', width: 9, value: (e) => e.totals.lateCount || null },
      { header: 'Sớm (lần)', width: 9, value: (e) => e.totals.earlyCount || null },
      { header: 'Chưa rõ', width: 8, value: (e) => e.totals.missingCount || null },
    ];
    const buf = await this.excel.build([{ name: `Bảng công ${q.month}`, rows: g.employees, columns }]);
    this.excel.send(res, `bang-cong-${q.month}.xlsx`, buf);
  }

  @Post('timesheets/recompute')
  @HttpCode(200)
  @RequireAnyPermission('attendance.timesheet.adjust', 'attendance.timesheet.close')
  recompute(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(recomputeSchema)) body: { unitId: string; month: string }) {
    return this.timesheet.enqueueUnitMonth(actor, body.unitId, body.month);
  }

  @Get('jobs/:id')
  @RequirePermissions('attendance.timesheet.read')
  job(@Param('id') id: string) {
    return this.timesheet.jobStatus(id);
  }

  @Get('timesheets/rows/:id')
  @RequirePermissions('attendance.timesheet.read')
  row(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.timesheet.rowDetail(actor, id);
  }

  @Patch('timesheets/rows/:id')
  @RequirePermissions('attendance.timesheet.adjust')
  adjust(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adjustTimesheetSchema)) body: AdjustTimesheetInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.timesheet.adjust(actor, id, body, meta);
  }

  @Get('periods')
  @RequirePermissions('attendance.timesheet.read')
  periods(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(month)) q: { month: string }) {
    return this.timesheet.periods(actor, q.month);
  }

  @Post('periods/confirm')
  @HttpCode(200)
  @RequirePermissions('attendance.timesheet.confirm')
  confirm(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(periodActionSchema)) body: PeriodActionInput, @ReqMeta() meta: RequestMeta) {
    return this.timesheet.confirm(actor, body, meta);
  }

  @Post('periods/close')
  @HttpCode(200)
  @RequirePermissions('attendance.timesheet.close')
  close(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(periodActionSchema)) body: PeriodActionInput, @ReqMeta() meta: RequestMeta) {
    return this.timesheet.close(actor, body, meta);
  }

  @Post('periods/reopen')
  @HttpCode(200)
  @RequirePermissions('attendance.timesheet.close')
  reopen(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(periodActionSchema)) body: PeriodActionInput, @ReqMeta() meta: RequestMeta) {
    return this.timesheet.reopen(actor, body, meta);
  }

  // ================= BÁO CÁO =================

  @Get('reports/late-early')
  @RequirePermissions('attendance.report.read')
  async lateEarly(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(attendanceReportQuerySchema)) q: AttendanceReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.lateEarly(actor, q, !!q.export);
    if (!q.export) return data;
    const buf = await this.excel.build([
      {
        name: 'Đi muộn về sớm',
        rows: data.items,
        columns: [
          { header: 'Ngày', numFmt: 'dd/mm/yyyy', value: (r) => new Date(r.date) },
          { header: 'Mã NV', value: (r) => r.employee.code },
          { header: 'Họ và tên', width: 26, value: (r) => r.employee.fullName },
          { header: 'Đơn vị', width: 26, value: (r) => r.employee.unit?.name },
          { header: 'Ca', value: (r) => r.shift?.code },
          { header: 'Giờ vào', value: (r) => vnTime(r.firstIn) },
          { header: 'Giờ ra', value: (r) => vnTime(r.lastOut) },
          { header: 'Muộn (phút)', value: (r) => (r.isLate ? r.lateMinutes : null) },
          { header: 'Sớm (phút)', value: (r) => (r.isEarly ? r.earlyMinutes : null) },
        ],
      },
    ]);
    this.excel.send(res, `di-muon-ve-som-${new Date().toISOString().slice(0, 10)}.xlsx`, buf);
  }

  @Get('reports/duty')
  @RequireAnyPermission('duty.pay.read', 'attendance.report.read')
  async duty(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(attendanceReportQuerySchema)) q: AttendanceReportQuery, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.duty(actor, q);
    if (!q.export) return data;
    const showPay = actor.permissions.has('duty.pay.read');
    type R = (typeof data.items)[number];
    const buf = await this.excel.build([
      {
        name: 'Trực',
        rows: data.items,
        columns: [
          { header: 'Mã NV', value: (r: R) => r.employee.code },
          { header: 'Họ và tên', width: 26, value: (r: R) => r.employee.fullName },
          { header: 'Đơn vị', width: 26, value: (r: R) => r.employee.unit?.name },
          { header: 'Số ca trực', value: (r: R) => r.count },
          { header: 'Số công trực', value: (r: R) => Number(r.units) },
          ...(showPay ? [{ header: 'Tiền trực (đồng)', width: 16, numFmt: '#,##0', value: (r: R) => Number(r.amount) }] : []),
        ],
      },
    ]);
    this.excel.send(res, `bao-cao-truc-${q.month ?? new Date().toISOString().slice(0, 7)}.xlsx`, buf);
  }

  @Get('dashboard')
  @RequirePermissions('attendance.report.read')
  dashboard(@CurrentUser() actor: AuthUser, @Query('campusId') campusId?: string) {
    return this.reports.dashboard(actor, campusId || undefined);
  }

  // ================= CÁ NHÂN =================

  @Get('me/timesheet')
  @RequirePermissions('self.timesheet.read')
  me(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(month)) q: { month: string }) {
    return this.timesheet.myMonth(actor, q.month);
  }

  @Get('statuses')
  statuses() {
    return TIMESHEET_STATUSES as Record<TimesheetStatus, string>;
  }
}
