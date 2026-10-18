import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createParameterVersionSchema, type CreateParameterVersionInput } from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequireAnyPermission, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PolicyService } from './policy.service';

@ApiTags('Tham số chính sách')
@Controller('policy-parameters')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get()
  @RequireAnyPermission('system.config.manage', 'payroll.config.manage', 'payroll.read', 'tax.read')
  list() {
    return this.policy.list();
  }

  @Post()
  @RequirePermissions('system.config.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createParameterVersionSchema)) body: CreateParameterVersionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.policy.create(actor, body, meta);
  }

  @Delete(':id')
  @RequirePermissions('system.config.manage')
  async remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    await this.policy.remove(actor, id, meta);
    return { ok: true };
  }
}
