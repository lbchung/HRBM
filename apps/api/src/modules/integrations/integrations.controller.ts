import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { INTEGRATION_ENTITIES, RECORD_SOURCES, type IntegrationEntity, type RecordSource } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IntegrationsService } from './integrations.service';

const entitySchema = z.enum(Object.keys(INTEGRATION_ENTITIES) as [IntegrationEntity, ...IntegrationEntity[]]);
const ownershipSchema = z.object({ source: z.enum(Object.keys(RECORD_SOURCES) as [RecordSource, ...RecordSource[]]) });

@ApiTags('Tích hợp')
@Controller('integrations')
@RequirePermissions('system.integration.manage')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('status')
  status() {
    return this.integrations.status();
  }

  @Get('ownership')
  ownership() {
    return this.integrations.ownership();
  }

  @Put('ownership/:entity')
  async setOwnership(
    @CurrentUser() actor: AuthUser,
    @Param('entity', new ZodValidationPipe(entitySchema)) entity: IntegrationEntity,
    @Body(new ZodValidationPipe(ownershipSchema)) body: { source: RecordSource },
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.integrations.setOwnership(actor, entity, body.source, meta);
    return { ok: true };
  }

  @Get('logs')
  logs() {
    return this.integrations.logs();
  }

  @Post('sync/:entity')
  @HttpCode(200)
  sync(
    @CurrentUser() actor: AuthUser,
    @Param('entity', new ZodValidationPipe(entitySchema)) entity: IntegrationEntity,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.syncNow(actor, entity, meta);
  }
}
