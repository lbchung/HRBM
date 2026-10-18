import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { addDays, toVnDate } from '@bachmai/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { HrModule } from '../hr/hr.module';
import { ATTENDANCE_CODE_CHANGED_EVENT, type AttendanceCodeChangedEvent } from '../hr/employees.service';
import { AttendanceReportsService } from './attendance-reports.service';
import { QUEUE_DEVICE_SYNC, QUEUE_TIMESHEET, SYNC_CONCURRENCY, type RecomputeItem } from './attendance.constants';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PunchesService } from './punches.service';
import { SchedulesService } from './schedules.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { TimesheetService } from './timesheet.service';
import { TimesheetsController } from './timesheets.controller';

/** Đăng ký job nền: đồng bộ máy 5 phút/lần, tính công, tính lại hằng đêm. */
@Injectable()
class AttendanceJobs implements OnModuleInit {
  constructor(
    private readonly queue: QueueService,
    private readonly devices: DevicesService,
    private readonly timesheet: TimesheetService,
    private readonly punches: PunchesService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.queue.schedule(QUEUE_DEVICE_SYNC, 'sync-all', { every: 5 * 60_000 });
    this.queue.schedule(QUEUE_TIMESHEET, 'nightly-recompute', { pattern: '0 1 * * *' });

    this.queue.process(
      QUEUE_DEVICE_SYNC,
      async (job) => {
        if (job.name === 'sync-all') return { devices: await this.devices.enqueueAll() };
        if (job.name === 'sync-device') return this.devices.syncDevice((job.data as { deviceId: string }).deviceId);
        throw new Error(`Job không xác định: ${job.name}`);
      },
      SYNC_CONCURRENCY,
    );

    this.queue.process(
      QUEUE_TIMESHEET,
      async (job) => {
        if (job.name === 'recompute') return this.timesheet.recompute((job.data as { items: RecomputeItem[] }).items);
        if (job.name === 'nightly-recompute') return this.nightly();
        throw new Error(`Job không xác định: ${job.name}`);
      },
      2,
    );
  }

  /** 01:00 hằng đêm: chốt kết quả ngày hôm qua cho mọi người có lịch (để ghi nhận vắng không quét) */
  private async nightly() {
    const yesterday = addDays(toVnDate(new Date()), -1);
    const d = new Date(`${yesterday}T00:00:00Z`);
    const rows = await this.prisma.schedule.findMany({ where: { date: d }, select: { employeeId: true }, distinct: ['employeeId'] });
    await this.timesheet.enqueueRecompute(rows.map((r) => ({ employeeId: r.employeeId, from: yesterday, to: yesterday })));
    return { employees: rows.length };
  }

  /** Hồ sơ đổi mã chấm công → gắn các lượt quét cũ và tính lại công */
  @OnEvent(ATTENDANCE_CODE_CHANGED_EVENT)
  async onCodeChanged(e: AttendanceCodeChangedEvent) {
    if (e.attendanceCode) await this.punches.backfill(e.attendanceCode, e.employeeId);
  }
}

@Module({
  imports: [HrModule],
  controllers: [DevicesController, ShiftsController, TimesheetsController],
  providers: [DevicesService, ShiftsService, SchedulesService, PunchesService, TimesheetService, AttendanceReportsService, AttendanceJobs],
  exports: [TimesheetService, ShiftsService],
})
export class AttendanceModule {}
