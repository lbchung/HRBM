import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from '@bachmai/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

@ApiTags('Nhật ký hệ thống')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('system.audit.read')
  list(@Query(new ZodValidationPipe(listAuditLogsQuerySchema)) q: ListAuditLogsQuery) {
    return this.audit.list(q);
  }
}
