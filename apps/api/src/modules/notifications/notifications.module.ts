import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { AllowPendingPassword, CurrentUser } from '../../common/auth/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('Thông báo')
@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @AllowPendingPassword()
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markRead(user.id);
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
