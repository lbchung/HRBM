import { Global, Module } from '@nestjs/common';
import { FastClient } from './fast.client';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, FastClient],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
