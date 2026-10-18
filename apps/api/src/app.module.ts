import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { HrModule } from './modules/hr/hr.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgModule } from './modules/org/org.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { REPO_ROOT } from './paths';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: join(REPO_ROOT, '.env') }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuditModule,
    NotificationsModule,
    FilesModule,
    CatalogsModule,
    PolicyModule,
    IntegrationsModule,
    ApprovalsModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrgModule,
    HrModule,
    AttendanceModule,
    LeaveModule,
    PayrollModule,
    HealthModule,
  ],
  providers: [
    // Thứ tự quan trọng: xác thực trước, kiểm tra quyền sau
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
