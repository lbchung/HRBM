'use client';

import {
  BankOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Breadcrumb, Button, Dropdown, Grid, Layout, Menu, Select, Spin, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BRAND } from '@bachmai/ui';
import { useThemeMode } from '@/app/providers';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth';
import { useCampusFilter } from '@/lib/campus-filter';
import { findMenu, MENU, type MenuNode } from '@/lib/menu';
import { useCampuses } from '@/lib/queries';
import { Forbidden } from './Forbidden';
import { NotificationBell } from './NotificationBell';

const { Header, Sider, Content, Footer } = Layout;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useMe();
  const can = useCan();
  const { dark, toggle } = useThemeMode();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setCollapsed(isMobile), [isMobile]);
  useEffect(() => {
    if (me?.mustChangePassword) router.replace('/change-password');
  }, [me, router]);

  const current = findMenu(pathname);
  const { campusId, setCampusId } = useCampusFilter();
  const { data: campuses } = useCampuses();
  const { data: approvalCount } = useQuery({
    queryKey: ['approvals', 'count'],
    queryFn: () => api<{ pending: number }>('/approvals/count'),
    refetchInterval: 60_000,
    enabled: !!me && !me.mustChangePassword,
  });
  const pending = approvalCount?.pending ?? 0;

  const items = useMemo<MenuProps['items']>(() => {
    const toItem = (n: MenuNode): NonNullable<MenuProps['items']>[number] | null => {
      if (n.children) {
        const children = n.children.filter((c) => can(c.permission)).map(toItem).filter(Boolean);
        return children.length ? { key: n.key, icon: n.icon, label: n.label, children } : null;
      }
      if (!can(n.permission)) return null;
      return {
        key: n.key,
        icon: n.icon,
        label: (
          <Link href={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span>
              {n.label}
              {n.comingSoon && <span style={{ opacity: 0.45, marginLeft: 6, fontSize: 11 }}>•</span>}
            </span>
            {n.key === '/approvals' && pending > 0 && <Badge count={pending} size="small" />}
          </Link>
        ),
      };
    };
    return MENU.map(toItem).filter(Boolean);
  }, [can, pending]);

  const [openKeys, setOpenKeys] = useState<string[]>([]);
  useEffect(() => {
    if (current?.parent) setOpenKeys((keys) => (keys.includes(current.parent!.key) ? keys : [...keys, current.parent!.key]));
  }, [current?.parent]);

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      queryClient.clear();
      window.location.href = '/login';
    }
  };

  if (isLoading || !me || me.mustChangePassword) {
    return (
      <div className="bm-center-page">
        <Spin size="large" />
      </div>
    );
  }

  const allowed = !current || can(current.node.permission);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={260}
        collapsible
        collapsed={collapsed}
        collapsedWidth={isMobile ? 0 : 72}
        trigger={null}
        theme={dark ? 'dark' : 'light'}
        style={{
          borderRight: '1px solid var(--bm-border)',
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 100,
          overflow: 'auto',
        }}
      >
        <Link href="/" className="bm-logo-bar">
          <img src={collapsed ? '/logo-mobile.png' : '/logo.png'} alt={BRAND.name} />
        </Link>
        <Menu
          mode="inline"
          items={items}
          selectedKeys={[current?.node.key ?? pathname]}
          openKeys={collapsed ? undefined : openKeys}
          onOpenChange={setOpenKeys}
          onClick={() => isMobile && setCollapsed(true)}
          style={{ borderInlineEnd: 0, paddingBlock: 8 }}
        />
      </Sider>
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 99 }}
        />
      )}
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--bm-border)',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Thu gọn menu"
          />
          {!isMobile && (
            <Breadcrumb
              items={[
                { title: <Link href="/">Trang chủ</Link> },
                ...(current?.parent ? [{ title: current.parent.label }] : []),
                ...(current && current.node.key !== '/' ? [{ title: current.node.label }] : []),
              ]}
            />
          )}
          <div style={{ flex: 1 }} />
          <Tooltip title="Cơ sở — bộ lọc mặc định cho các danh sách">
            <Select
              value={campusId ?? ''}
              onChange={(v) => setCampusId(v || undefined)}
              style={{ width: isMobile ? 120 : 170 }}
              options={[{ value: '', label: 'Tất cả cơ sở' }, ...(campuses?.map((c) => ({ value: c.id, label: c.name })) ?? [])]}
              prefix={<BankOutlined />}
            />
          </Tooltip>
          <NotificationBell />
          <Tooltip title={dark ? 'Giao diện sáng' : 'Giao diện tối'}>
            <Button type="text" icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'profile', icon: <UserOutlined />, label: <Link href="/profile">Tài khoản của tôi</Link> },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ background: BRAND.primary }} size={32}>
                {me.fullName.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
              </Avatar>
              {!isMobile && (
                <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <Typography.Text strong style={{ display: 'block' }}>
                    {me.fullName}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {me.roles.map((r) => r.name).join(', ')}
                  </Typography.Text>
                </span>
              )}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: isMobile ? 16 : 24 }}>{allowed ? children : <Forbidden />}</Content>
        <Footer style={{ textAlign: 'center', fontSize: 12, color: 'var(--bm-text-secondary)', padding: '12px 16px' }}>
          © {new Date().getFullYear()} {BRAND.name} · {BRAND.slogan}
        </Footer>
      </Layout>
    </Layout>
  );
}
