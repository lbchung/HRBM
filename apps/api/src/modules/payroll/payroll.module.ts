import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { HrModule } from '../hr/hr.module';
import { ExtraIncomeService } from './extra-income.service';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollController } from './payroll.controller';
import { PayrollRunsService, QUEUE_PAYROLL } from './payroll-runs.service';
import { RetroPayService } from './retro-pay.service';
import { SalaryRaisesService } from './salary-raises.service';

/** Job nền tính lương (một kỳ một job — không chạy song song hai kỳ) */
@Injectable()
class PayrollJobs implements OnModuleInit {
  private readonly logger = new Logger('PayrollJobs');

  constructor(
    private readonly queue: QueueService,
    private readonly runs: PayrollRunsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.queue.process(
      QUEUE_PAYROLL,
      async (job) => {
        if (job.name !== 'calculate') throw new Error(`Job không xác định: ${job.name}`);
        const { runId } = job.data as { runId: string };
        try {
          return await this.runs.calculate(runId);
        } catch (e) {
          this.logger.error(`Tính lương lỗi (${runId}): ${e instanceof Error ? e.stack : e}`);
          await this.prisma.payrollRun.update({ where: { id: runId }, data: { status: 'DRAFT' } }).catch(() => undefined);
          throw e;
        }
      },
      1,
    );
  }
}

@Module({
  imports: [HrModule, AttendanceModule],
  controllers: [PayrollController],
  providers: [PayrollInputsService, PayrollConfigService, PayrollRunsService, SalaryRaisesService, RetroPayService, ExtraIncomeService, PayrollJobs],
  exports: [PayrollInputsService, PayrollRunsService],
})
export class PayrollModule {}
