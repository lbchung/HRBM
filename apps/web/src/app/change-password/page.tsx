'use client';

import { Alert, Button, Card, Spin, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  };

  if (isLoading) {
    return (
      <div className="bm-center-page">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="bm-center-page">
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img src="/logo-mobile.png" alt="" style={{ height: 56 }} />
          <Typography.Title level={4} className="bm-heading" style={{ marginTop: 12 }}>
            Đổi mật khẩu
          </Typography.Title>
        </div>
        {me?.mustChangePassword && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Bạn cần đổi mật khẩu trước khi sử dụng hệ thống"
            description="Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được đặt lại."
          />
        )}
        <ChangePasswordForm onDone={() => router.replace('/')} />
        <Button type="link" onClick={logout} style={{ paddingInline: 0, marginTop: 12 }}>
          Đăng xuất
        </Button>
      </Card>
    </div>
  );
}
