'use client';

import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { passwordPolicySchema, type ChangePasswordInput } from '@bachmai/shared';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [form] = Form.useForm<ChangePasswordInput & { confirm: string }>();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const submit = async ({ currentPassword, newPassword }: ChangePasswordInput) => {
    setLoading(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      message.success('Đổi mật khẩu thành công');
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      onDone?.();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} style={{ maxWidth: 420 }}>
      <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label="Mật khẩu mới"
        extra="Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt"
        rules={[{ required: true, message: 'Nhập mật khẩu mới' }, zodRule(passwordPolicySchema)]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirm"
        label="Nhập lại mật khẩu mới"
        dependencies={['newPassword']}
        rules={[
          { required: true, message: 'Nhập lại mật khẩu mới' },
          ({ getFieldValue }) => ({
            validator: async (_, v) => {
              if (v && v !== getFieldValue('newPassword')) throw new Error('Mật khẩu nhập lại không khớp');
            },
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading}>
        Đổi mật khẩu
      </Button>
    </Form>
  );
}
