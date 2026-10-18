import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
