import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Validate body/query bằng Zod schema dùng chung từ @bachmai/shared. */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dữ liệu không hợp lệ',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
