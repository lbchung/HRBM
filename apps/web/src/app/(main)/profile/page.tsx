'use client';

import { Card, Col, Descriptions, Row, Tag } from 'antd';
import { DATA_SCOPE_LABELS } from '@bachmai/shared';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { PageHeader } from '@/components/PageHeader';
import { TwoFactorCard } from '@/components/TwoFactorCard';
import { useMe } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export default function ProfilePage() {
  const { data: me } = useMe();
  if (!me) return null;

  return (
    <>
      <PageHeader title="Tài khoản của tôi" />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Thông tin tài khoản">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Tên đăng nhập">{me.username}</Descriptions.Item>
              <Descriptions.Item label="Họ tên">{me.fullName}</Descriptions.Item>
              <Descriptions.Item label="Email">{me.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Điện thoại">{me.phone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Cơ sở">{me.campus?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Đơn vị">{me.unit?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Nhóm tài khoản">
                {me.roles.map((r) => (
                  <Tag color="green" key={r.id}>
                    {r.name}
                  </Tag>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="Phạm vi dữ liệu">{DATA_SCOPE_LABELS[me.dataScope]}</Descriptions.Item>
              <Descriptions.Item label="Số quyền">{me.permissions.length}</Descriptions.Item>
              <Descriptions.Item label="Đăng nhập lần cuối">{formatDateTime(me.lastLoginAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Đổi mật khẩu">
            <ChangePasswordForm />
          </Card>
          <TwoFactorCard enabled={me.totpEnabled} />
        </Col>
      </Row>
    </>
  );
}
