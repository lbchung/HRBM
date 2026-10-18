import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './crypto/encryption.service';
import { ExcelService } from './excel/excel.service';
import { QueueService } from './queue/queue.service';

@Global()
@Module({
  providers: [
    {
      provide: EncryptionService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new EncryptionService(config.getOrThrow<string>('DATA_ENCRYPTION_KEY')),
    },
    ExcelService,
    QueueService,
  ],
  exports: [EncryptionService, ExcelService, QueueService],
})
export class CommonModule {}
