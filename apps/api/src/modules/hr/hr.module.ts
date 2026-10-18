import { Module } from '@nestjs/common';
import { EmployeeImportService } from './employee-import.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { HrReportsController } from './hr-reports.controller';
import { HrReportsService } from './hr-reports.service';
import { SubRecordsService } from './sub-records.service';

@Module({
  // HrReportsController trước để /hr/assignments không bị /hr/employees/:id bắt nhầm
  controllers: [HrReportsController, EmployeesController],
  providers: [EmployeesService, SubRecordsService, HrReportsService, EmployeeImportService],
  exports: [EmployeesService],
})
export class HrModule {}
