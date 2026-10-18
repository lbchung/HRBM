import type { FormInstance } from 'antd';
import type { Rule } from 'antd/es/form';
import type { ZodTypeAny } from 'zod';
import { ApiError } from './api';

/** Dùng Zod schema dùng chung làm rule cho antd Form — FE và BE cùng một luật validate. */
export function zodRule(schema: ZodTypeAny): Rule {
  return {
    validator: async (_, value) => {
      const r = schema.safeParse(value);
      if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'Giá trị không hợp lệ');
    },
  };
}

/** Gắn lỗi validate từ API vào đúng trường của form. Trả về true nếu đã gắn được. */
export function applyServerErrors(form: FormInstance, err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.errors) return false;
  const fields = Object.entries(err.errors).map(([name, errors]) => ({ name, errors }));
  if (!fields.length) return false;
  form.setFields(fields);
  return true;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Có lỗi xảy ra';
}
