import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { FilesService, type UploadedFileInput } from './files.service';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Giới hạn cứng 50 MB ở tầng multer; giới hạn cấu hình (UPLOAD_MAX_MB) kiểm tra trong service. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  upload(@UploadedFile() file: UploadedFileInput | undefined, @CurrentUser() user: AuthUser) {
    return this.files.save(file, user);
  }

  @Get(':id')
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { file, inline, stream } = await this.files.open(id, user);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="file"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }
}
