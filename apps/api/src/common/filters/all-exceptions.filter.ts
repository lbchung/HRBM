import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@bachmai/db';
import type { Request, Response } from 'express';

/** Chuẩn hóa lỗi trả về: { statusCode, message, code?, errors?, path, timestamp }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { message: 'Lỗi hệ thống, vui lòng thử lại sau' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'string' ? { message: r } : { ...(r as object) };
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        body = { message: 'Thao tác quá nhiều lần, vui lòng thử lại sau' };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        body = { message: `Dữ liệu đã tồn tại${target ? ` (${target})` : ''}` };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { message: 'Không tìm thấy dữ liệu' };
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        body = { message: 'Dữ liệu đang được sử dụng ở nơi khác' };
      }
    }

    if (status >= 500) this.logger.error(exception);

    delete body.statusCode;
    delete body.error;
    res.status(status).json({
      statusCode: status,
      ...body,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
