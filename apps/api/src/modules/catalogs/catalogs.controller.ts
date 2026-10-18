import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCatalogItemSchema,
  updateCatalogItemSchema,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CatalogsService } from './catalogs.service';

/** Danh mục là dữ liệu tra cứu: mọi tài khoản đã đăng nhập đều đọc được. */
@ApiTags('Danh mục dùng chung')
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get('types')
  types() {
    return this.catalogs.types();
  }

  @Get()
  list(@Query('type') type?: string, @Query('includeInactive') includeInactive?: string) {
    return this.catalogs.list(type || undefined, includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('org.catalog.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createCatalogItemSchema)) body: CreateCatalogItemInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.create(actor, body, meta);
  }

  @Patch(':id')
  @RequirePermissions('org.catalog.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCatalogItemSchema)) body: UpdateCatalogItemInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.update(actor, id, body, meta);
  }
}
