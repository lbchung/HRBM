'use client';

import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BRAND } from '@bachmai/ui';
import type { LoginInput } from '@bachmai/shared';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/form';

type LoginResponse = { requires2fa: true; challenge: string } | { requires2fa: false; mustChangePassword: boolean };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [challenge, setChallenge] = useState<string | null>(null);

  const finish = (mustChangePassword: boolean) => {
    const next = params.get('next');
    // Chỉ cho phép chuyển hướng nội bộ
    const target = mustChangePassword ? '/change-password' : next?.startsWith('/') && !next.startsWith('//') ? next : '/';
    router.replace(target);
    router.refresh();
  };

  const submit = async (values: LoginInput) => {
    setLoading(true);
    setError(undefined);
    try {
      const r = await api<LoginResponse>('/auth/login', { method: 'POST', body: values });
      if (r.requires2fa) {
        setChallenge(r.challenge);
        setLoading(false);
      } else finish(r.mustChangePassword);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };

  const submitCode = async ({ code }: { code: string }) => {
    setLoading(true);
    setError(undefined);
    try {
      const r = await api<{ mustChangePassword: boolean }>('/auth/login/2fa', { method: 'POST', body: { challenge, code } });
      finish(r.mustChangePassword);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
      if (e instanceof ApiError && e.status === 401 && /hết hạn|không hợp lệ/.test(e.message)) setChallenge(null);
    }
  };

  if (challenge) {
    return (
      <Form layout="vertical" size="large" onFinish={submitCode} requiredMark={false}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Nhập mã 6 số trong ứng dụng Authenticator trên điện thoại" />
        <Form.Item name="code" label="Mã xác thực" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Nhập mã 6 chữ số' }]}>
          <Input prefix={<SafetyCertificateOutlined />} maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus style={{ letterSpacing: 4 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          Xác nhận
        </Button>
        <Button type="link" block onClick={() => setChallenge(null)} style={{ marginTop: 8 }}>
          Quay lại
        </Button>
      </Form>
    );
  }

  return (
    <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
        <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
      </Form.Item>
      <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>
        Đăng nhập
      </Button>
    </Form>
  );
}

export default function LoginPage() {
  return (
    <div className="bm-login">
      <section className="bm-login-brand">
        <div className="logo-card">
          <img src="/logo.png" alt={BRAND.name} />
        </div>
        <h1>
          Hệ thống Quản lý
          <br />
          Nhân sự – Chấm công – Tiền lương
        </h1>
        <div style={{ fontSize: 16, opacity: 0.9 }}>{BRAND.name} · Cơ sở Hà Nội & Ninh Bình</div>
        <span className="slogan">{BRAND.slogan}</span>
      </section>
      <section className="bm-login-form">
        <div className="inner">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src="/logo-mobile.png" alt="" style={{ height: 64, marginBottom: 12 }} />
            <Typography.Title level={3} className="bm-heading" style={{ margin: 0 }}>
              Đăng nhập
            </Typography.Title>
            <Typography.Text type="secondary">{BRAND.appName}</Typography.Text>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
          <Typography.Paragraph type="secondary" style={{ marginTop: 24, fontSize: 12, textAlign: 'center' }}>
            Quên mật khẩu? Liên hệ Phòng Tổ chức cán bộ hoặc Trung tâm CNTT để được cấp lại.
          </Typography.Paragraph>
        </div>
      </section>
    </div>
  );
}
