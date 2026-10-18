'use client';

import { App, Button, Card, Form, Space } from 'antd';
import { useMemo, useState } from 'react';
import { FormFields, fromFormValues, toFormValues } from '@/components/FormFields';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { EMPLOYEE_FIELDS, EMPLOYEE_SECTIONS } from './fields';

export interface EmployeeRecord extends ApiRecord {
  id: string;
  code: string;
  fullName: string;
  status: string;
  sensitiveMasked?: boolean;
}

interface Props {
  employee?: EmployeeRecord | null;
  defaults?: Record<string, unknown>;
  onSaved: (e: EmployeeRecord) => void;
  onCancel?: () => void;
}

/** Form thêm / sửa hồ sơ. Khi sửa chỉ gửi các trường thay đổi (tránh ghi đè dữ liệu nhạy cảm đang bị che). */
export function EmployeeForm({ employee, defaults, onSaved, onCancel }: Props) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const isEdit = !!employee;
  const initial = useMemo(
    () => toFormValues(EMPLOYEE_FIELDS, employee ?? { gender: 'MALE', status: 'WORKING', nationality: 'Việt Nam', ...defaults }),
    [employee, defaults],
  );

  const submit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body = fromFormValues(EMPLOYEE_FIELDS, values);
      let saved: EmployeeRecord;
      if (isEdit) {
        const before = fromFormValues(EMPLOYEE_FIELDS, initial);
        const changed = Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== 'code' && v !== before[k]));
        if (!Object.keys(changed).length) {
          message.info('Không có thay đổi');
          onCancel?.();
          return;
        }
        saved = await api<EmployeeRecord>(`/hr/employees/${employee.id}`, { method: 'PATCH', body: changed });
      } else {
        saved = await api<EmployeeRecord>('/hr/employees', { method: 'POST', body });
      }
      message.success('Đã lưu hồ sơ');
      onSaved(saved);
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} scrollToFirstError>
      {EMPLOYEE_SECTIONS.map((s) => (
        <Card key={s.title} size="small" title={s.title} style={{ marginBottom: 16 }}>
          <FormFields fields={s.fields} isEdit={isEdit} />
        </Card>
      ))}
      {employee?.sensitiveMasked && (
        <p style={{ color: 'var(--bm-text-secondary)', fontSize: 12 }}>
          Thông tin CCCD, mã số thuế, số tài khoản đang được che. Chỉ nhập lại nếu muốn thay đổi.
        </p>
      )}
      <Space>
        <Button type="primary" htmlType="submit" loading={saving}>
          Lưu hồ sơ
        </Button>
        {onCancel && <Button onClick={onCancel}>Hủy</Button>}
      </Space>
    </Form>
  );
}
