'use client';

import { ApartmentOutlined, BankOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { DATA_SCOPE_LABELS } from '@bachmai/shared';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth';
import { MENU } from '@/lib/menu';

interface Summary {
  campuses: number;
  units: number;
  users: number;
  roles: number;
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const can = useCan();
  const { data: summary, isLoading } = useQuery({ queryKey: ['org-summary'], queryFn: () => api<Summary>('/org/summary') });

  const stats = [
    { title: 'Cơ sở', value: summary?.campuses, icon: <BankOutlined />, href: '/org/campuses', perm: 'org.campus.read' },
    { title: 'Đơn vị', value: summary?.units, icon: <ApartmentOutlined />, href: '/org/units', perm: 'org.unit.read' },
    { title: 'Tài khoản', value: summary?.users, icon: <TeamOutlined />, href: '/system/users', perm: 'system.user.read' },
    { title: 'Nhóm tài khoản', value: summary?.roles, icon: <SafetyCertificateOutlined />, href: '/system/roles', perm: 'system.role.read' },
  ];

  const modules = MENU.filter((m) => m.children && m.key !== 'me')
    .map((m) => ({ ...m, children: m.children!.filter((c) => can(c.permission)) }))
    .filter((m) => m.children.length);

  return (
    <>
      <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg,#006236,#008046 60%,#0a9a58)', border: 0 }}>
        <Typography.Title level={3} className="bm-heading" style={{ color: '#fff', margin: 0 }}>
          Xin chào, {me?.fullName}
        </Typography.Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>
          {dayjs().format('dddd, [ngày] DD/MM/YYYY')} · Phạm vi dữ liệu:{' '}
          {me ? DATA_SCOPE_LABELS[me.dataScope] : ''}
        </Typography.Text>
      </Card>

      <Row gutter={[16, 16]}>
        {stats.map((s) => (
          <Col xs={12} md={6} key={s.title}>
            <Card className="bm-stat-card" hoverable={can(s.perm)}>
              <Link href={can(s.perm) ? s.href : '#'} style={{ color: 'inherit' }}>
                <Statistic
                  title={s.title}
                  value={s.value}
                  loading={isLoading}
                  prefix={<span style={{ color: 'var(--bm-primary)', marginRight: 4 }}>{s.icon}</span>}
                />
              </Link>
            </Card>
          </Col>
        ))}
      </Row>

      <Typography.Title level={4} className="bm-heading" style={{ marginTop: 24 }}>
        Phân hệ
      </Typography.Title>
      <Row gutter={[16, 16]}>
        {modules.map((m) => (
          <Col xs={24} sm={12} xl={8} key={m.key}>
            <Card
              title={
                <span>
                  <span style={{ color: 'var(--bm-primary)', marginRight: 8 }}>{m.icon}</span>
                  {m.label}
                </span>
              }
              size="small"
              style={{ height: '100%' }}
            >
              {m.children.map((c) => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <Link href={c.key}>{c.label}</Link>
                  {c.comingSoon ? <Tag>{c.comingSoon}</Tag> : <Tag color="green">Sẵn sàng</Tag>}
                </div>
              ))}
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
