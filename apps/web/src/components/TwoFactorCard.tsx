'use client';

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Modal, Space, Steps, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage } from '@/lib/form';

interface Setup {
  secret: string;
  uri: string;
  qrDataUrl: string;
}

/** Bật / tắt xác thực 2 lớp bằng ứng dụng Authenticator (Google, Microsoft…). */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enableForm] = Form.useForm();
  const [disableForm] = Form.useForm();

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api<Setup>('/auth/2fa/setup', { method: 'POST' }));
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const enable = async ({ code }: { code: string }) => {
    setBusy(true);
    try {
      await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      message.success('Đã bật xác thực 2 lớp');
      setSetup(null);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      if (!applyServerErrors(enableForm, e)) message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (v: { password: string; code: string }) => {
    setBusy(true);
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: v });
      message.success('Đã tắt xác thực 2 lớp');
      setDisabling(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      if (!applyServerErrors(disableForm, e)) message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <SafetyCertificateOutlined /> Xác thực 2 lớp
        </Space>
      }
      extra={enabled ? <Tag color="green">Đang bật</Tag> : <Tag>Chưa bật</Tag>}
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary">
        Khi đăng nhập, ngoài mật khẩu cần nhập mã 6 số từ ứng dụng Google Authenticator / Microsoft Authenticator trên điện thoại.
        Khuyến nghị bật cho tài khoản quản trị, TCCB, TCKT.
      </Typography.Paragraph>
      {enabled ? (
        <Button danger onClick={() => setDisabling(true)}>
          Tắt xác thực 2 lớp
        </Button>
      ) : (
        <Button type="primary" loading={busy && !setup} onClick={start}>
          Bật xác thực 2 lớp
        </Button>
      )}

      <Modal open={!!setup} title="Bật xác thực 2 lớp" onCancel={() => setSetup(null)} onOk={() => enableForm.submit()} okText="Xác nhận" confirmLoading={busy} destroyOnHidden>
        {setup && (
          <>
            <Steps
              direction="vertical"
              size="small"
              current={-1}
              items={[
                { title: 'Cài ứng dụng Google Authenticator hoặc Microsoft Authenticator trên điện thoại' },
                {
                  title: 'Quét mã QR',
                  description: (
                    <>
                      <img src={setup.qrDataUrl} alt="Mã QR" width={200} height={200} style={{ display: 'block', margin: '8px 0' }} />
                      Hoặc nhập khóa: <Typography.Text code copyable>{setup.secret}</Typography.Text>
                    </>
                  ),
                },
                { title: 'Nhập mã 6 số hiển thị trên ứng dụng' },
              ]}
            />
            <Form form={enableForm} layout="vertical" onFinish={enable}>
              <Form.Item name="code" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Nhập mã 6 chữ số' }]}>
                <Input maxLength={6} inputMode="numeric" autoComplete="one-time-code" style={{ width: 160, letterSpacing: 4, fontSize: 18 }} autoFocus />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal open={disabling} title="Tắt xác thực 2 lớp" onCancel={() => setDisabling(false)} onOk={() => disableForm.submit()} okText="Tắt" okButtonProps={{ danger: true }} confirmLoading={busy} destroyOnHidden>
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Tài khoản sẽ chỉ được bảo vệ bằng mật khẩu." />
        <Form form={disableForm} layout="vertical" onFinish={disable}>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="code" label="Mã xác thực hiện tại" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Nhập mã 6 chữ số' }]}>
            <Input maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
