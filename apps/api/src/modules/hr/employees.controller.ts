import {
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
  createEmployeeSchema,
  EMPLOYEE_STATUSES,
  EMPLOYEE_SUB_RESOURCES,
  GENDERS,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type EmployeeStatus,
  type EmployeeSubResource,
  type Gender,
  type ListEmployeesQuery,
  type UpdateEmployeeInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ExcelService } from '../../common/excel/excel.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CatalogsService } from '../catalogs/catalogs.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeesService } from './employees.service';
import { SubRecordsService } from './sub-records.service';

const resourceSchema = z.enum(EMPLOYEE_SUB_RESOURCES as [EmployeeSubResource, ...EmployeeSubResource[]]);
const ymdToDate = (d: Date | null | undefined) => (d ? new Date(d) : null);

@ApiTags('Nhân sự — Hồ sơ')
@Controller('hr/employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly subRecords: SubRecordsService,
    private readonly importer: EmployeeImportService,
    private readonly excel: ExcelService,
    private readonly catalogs: CatalogsService,
  ) {}

  @Get()
  @RequirePermissions('hr.employee.read')
  list(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(listEmployeesQuerySchema)) q: ListEmployeesQuery) {
    return this.employees.list(actor, q);
  }

  @Get('export')
  @RequirePermissions('hr.employee.read', 'hr.employee.export')
  async export(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(listEmployeesQuerySchema)) q: ListEmployeesQuery,
    @Res() res: Response,
  ) {
    const rows = await this.employees.listForExport(actor, q);
    const n = await this.catalogs.nameMaps(['POSITION', 'JOB_TITLE', 'CONTRACT_TYPE', 'EDUCATION_LEVEL', 'BANK', 'ETHNICITY']);
    const name = (type: string, code: string | null) => (code ? (n[type].get(code) ?? code) : null);
    const buf = await this.excel.build([
      {
        name: 'Nhân viên',
        rows,
        columns: [
          { header: 'Mã NV', value: (e) => e.code },
          { header: 'Họ và tên', width: 26, value: (e) => e.fullName },
          { header: 'Giới tính', width: 10, value: (e) => GENDERS[e.gender as Gender] },
          { header: 'Ngày sinh', numFmt: 'dd/mm/yyyy', value: (e) => ymdToDate(e.dateOfBirth) },
          { header: 'Cơ sở', value: (e) => e.campus.name },
          { header: 'Đơn vị', width: 30, value: (e) => e.unit.name },
          { header: 'Chức vụ', value: (e) => name('POSITION', e.positionCode) },
          { header: 'Chức danh nghề nghiệp', width: 26, value: (e) => name('JOB_TITLE', e.jobTitleCode) },
          { header: 'Loại hợp đồng', width: 30, value: (e) => name('CONTRACT_TYPE', e.contractTypeCode) },
          { header: 'Trình độ', value: (e) => name('EDUCATION_LEVEL', e.educationLevelCode) },
          { header: 'Chuyên ngành', value: (e) => e.specialty },
          { header: 'Ngày vào làm', numFmt: 'dd/mm/yyyy', value: (e) => ymdToDate(e.startDate) },
          { header: 'Trạng thái', value: (e) => EMPLOYEE_STATUSES[e.status as EmployeeStatus] },
          { header: 'Số CCCD', value: (e) => e.idNumber },
          { header: 'Mã số thuế', value: (e) => e.taxCode },
          { header: 'Số sổ BHXH', value: (e) => e.socialInsuranceNo },
          { header: 'Điện thoại', value: (e) => e.phone },
          { header: 'Email', width: 26, value: (e) => e.email },
          { header: 'Dân tộc', value: (e) => name('ETHNICITY', e.ethnicityCode) },
          { header: 'Số tài khoản', value: (e) => e.bankAccountNo },
          { header: 'Ngân hàng', value: (e) => name('BANK', e.bankCode) },
          { header: 'Địa chỉ thường trú', width: 34, value: (e) => e.permanentAddress },
          { header: 'Tài khoản đăng nhập', value: (e) => e.user?.username },
        ],
      },
    ]);
    this.excel.send(res, `nhan-vien-${new Date().toISOString().slice(0, 10)}.xlsx`, buf);
  }

  @Get('import/template')
  @RequirePermissions('hr.employee.import')
  async template(@Res() res: Response) {
    this.excel.send(res, 'mau-import-nhan-vien.xlsx', await this.importer.template());
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('hr.employee.import', 'hr.employee.create', 'hr.employee.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  import(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query('commit') commit: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.importer.run(actor, file?.buffer, commit === 'true', meta);
  }

  /** Hồ sơ của chính tài khoản đang đăng nhập (null nếu chưa liên kết). */
  @Get('me')
  me(@CurrentUser() actor: AuthUser) {
    return this.employees.me(actor);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(actor, id);
  }

  @Get(':id/history')
  @RequirePermissions('hr.employee.read')
  history(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.history(actor, id);
  }

  @Post()
  @RequirePermissions('hr.employee.create')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.employees.create(actor, body, meta);
  }

  @Patch(':id')
  @RequirePermissions('hr.employee.update')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.employees.update(actor, id, body, meta);
  }

  @Delete(':id')
  @RequirePermissions('hr.employee.delete')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.employees.remove(actor, id, meta);
    return { ok: true };
  }

  @Post(':id/account')
  @HttpCode(200)
  @RequirePermissions('system.user.create', 'hr.employee.update')
  createAccount(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.employees.createAccount(actor, id, meta);
  }

  // ---------- Hồ sơ con: gia đình, công tác, hợp đồng, phân công, tài liệu, đào tạo, khen thưởng, kỷ luật, lương ----------

  @Get(':id/:resource')
  listSub(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resource', new ZodValidationPipe(resourceSchema)) resource: EmployeeSubResource,
  ) {
    return this.subRecords.list(actor, id, resource);
  }

  @Post(':id/:resource')
  createSub(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resource', new ZodValidationPipe(resourceSchema)) resource: EmployeeSubResource,
    @Body() body: unknown,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.subRecords.create(actor, id, resource, body, meta);
  }

  @Patch(':id/:resource/:recordId')
  updateSub(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resource', new ZodValidationPipe(resourceSchema)) resource: EmployeeSubResource,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() body: unknown,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.subRecords.update(actor, id, resource, recordId, body, meta);
  }

  @Delete(':id/:resource/:recordId')
  async removeSub(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('resource', new ZodValidationPipe(resourceSchema)) resource: EmployeeSubResource,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.subRecords.remove(actor, id, resource, recordId, meta);
    return { ok: true };
  }
}
