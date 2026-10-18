'use client';

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Dropdown, Input, Select, Space, Table, Tag, TreeSelect, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { USER_STATUS_LABELS, USER_STATUSES, type Paginated, type UserStatus } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile } from '@/lib/api';
import { useCan, useMe, type RefItem } from '@/lib/auth';
import { errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { buildUnitTree, useCampuses, useRoles, useUnits } from '@/lib/queries';
import type { UserRow } from './types';
import { UserFormDrawer } from './UserFormDrawer';

const STATUS_COLOR: Record<UserStatus, string> = { ACTIVE: 'green', LOCKED: 'red', DISABLED: 'default' };
type Op = 'lock' | 'unlock' | 'reset-password' | 'reset-2fa' | 'delete';

export default function UsersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const { data: me } = useMe();
  const { data: campuses } = useCampuses();
  const { data: units } = useUnits();
  const { data: roles } = useRoles();

  const [filters, setFilters] = useState<{ search?: string; status?: string; campusId?: string; unitId?: string; roleId?: string }>({});
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['users', filters, page],
    queryFn: () => api<Paginated<UserRow>>('/users', { query: { ...filters, ...page } }),
    placeholderData: keepPreviousData,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const showPassword = (username: string, password: string) =>
    modal.success({
      title: 'Mật khẩu tạm thời',
      width: 460,
      content: (
        <>
          <p>
            Tài khoản <b>{username}</b> — người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.
          </p>
          <Typography.Paragraph copyable={{ text: password }} code style={{ fontSize: 18 }}>
            {password}
          </Typography.Paragraph>
          <Typography.Text type="warning">Mật khẩu chỉ hiển thị một lần. Hãy lưu lại và gửi cho người dùng.</Typography.Text>
        </>
      ),
    });

  const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile('/users/export', filters, 'tai-khoan.xlsx');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const action = useMutation({
    mutationFn: ({ id, op }: { id: string; op: Op }) =>
      op === 'delete'
        ? api(`/users/${id}`, { method: 'DELETE' })
        : api<{ temporaryPassword?: string }>(`/users/${id}/${op}`, { method: 'POST' }),
    onSuccess: (res, { op }) => {
      refresh();
      if (op === 'lock') message.success('Đã khóa tài khoản');
      if (op === 'unlock') message.success('Đã mở khóa tài khoản');
      if (op === 'delete') message.success('Đã xóa tài khoản');
      if (op === 'reset-2fa') message.success('Đã tắt xác thực 2 lớp của tài khoản');
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const confirm = (u: UserRow, op: Op) => {
    const texts = {
      'reset-2fa': ['Đặt lại xác thực 2 lớp', `Tắt xác thực 2 lớp của ${u.username} (khi người dùng mất điện thoại)? Người dùng có thể bật lại sau.`],
      lock: ['Khóa tài khoản', `Khóa tài khoản ${u.username}? Người dùng sẽ bị đăng xuất ngay.`],
      unlock: ['Mở khóa tài khoản', `Mở khóa tài khoản ${u.username}?`],
      'reset-password': ['Đặt lại mật khẩu', `Tạo mật khẩu tạm mới cho ${u.username}? Người dùng sẽ bị đăng xuất.`],
      delete: ['Xóa tài khoản', `Xóa tài khoản ${u.username}? Thao tác này không thể hoàn tác trên giao diện.`],
    } as const;
    modal.confirm({
      title: texts[op][0],
      content: texts[op][1],
      okButtonProps: { danger: op === 'delete' || op === 'lock' },
      onOk: async () => {
        const res = await action.mutateAsync({ id: u.id, op });
        if (op === 'reset-password' && res && 'temporaryPassword' in (res as object)) {
          showPassword(u.username, (res as { temporaryPassword: string }).temporaryPassword);
        }
      },
    });
  };

  const isTempLocked = (u: UserRow) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date();

  const columns: ColumnsType<UserRow> = [
    {
      title: 'Tài khoản',
      key: 'user',
      render: (_, u) => (
        <div>
          <Typography.Text strong>{u.fullName}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {u.username}
              {u.email ? ` · ${u.email}` : ''}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhóm tài khoản',
      dataIndex: 'roles',
      render: (rs: RefItem[]) => rs.map((r) => <Tag key={r.id} color="green">{r.name}</Tag>),
    },
    { title: 'Cơ sở', dataIndex: ['campus', 'name'], render: (v) => v ?? '—', responsive: ['md'] },
    { title: 'Đơn vị', dataIndex: ['unit', 'name'], render: (v) => v ?? '—', responsive: ['lg'] },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (s: UserStatus, u) => (
        <Space size={4} wrap>
          <Tag color={STATUS_COLOR[s]}>{USER_STATUS_LABELS[s]}</Tag>
          {isTempLocked(u) && <Tag color="orange">Tạm khóa</Tag>}
          {u.mustChangePassword && <Tag color="gold">Chờ đổi mật khẩu</Tag>}
          {u.totpEnabled && <Tag color="blue">2FA</Tag>}
        </Space>
      ),
    },
    { title: 'Đăng nhập cuối', dataIndex: 'lastLoginAt', render: formatDateTime, responsive: ['xl'] },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, u) => {
        const self = u.id === me?.id;
        return (
          <Space size={0}>
            {can('system.user.update') && <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(u)} aria-label="Sửa" />}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  can('system.user.update') && { key: 'reset', icon: <KeyOutlined />, label: 'Đặt lại mật khẩu', onClick: () => confirm(u, 'reset-password') },
                  can('system.user.update') && u.totpEnabled && { key: 'reset2fa', icon: <SafetyCertificateOutlined />, label: 'Đặt lại xác thực 2 lớp', onClick: () => confirm(u, 'reset-2fa') },
                  can('system.user.lock') && !self && (u.status === 'LOCKED' || isTempLocked(u))
                    ? { key: 'unlock', icon: <UnlockOutlined />, label: 'Mở khóa', onClick: () => confirm(u, 'unlock') }
                    : can('system.user.lock') && !self && { key: 'lock', icon: <LockOutlined />, label: 'Khóa tài khoản', onClick: () => confirm(u, 'lock') },
                  can('system.user.delete') && !self && { type: 'divider' as const },
                  can('system.user.delete') && !self && { key: 'delete', icon: <DeleteOutlined />, label: 'Xóa', danger: true, onClick: () => confirm(u, 'delete') },
                ].filter(Boolean) as never,
              }}
            >
              <Button type="text" icon={<MoreOutlined />} aria-label="Thao tác khác" />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const setFilter = (k: keyof typeof filters, v?: string) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    setPage((p) => ({ ...p, page: 1 }));
  };

  return (
    <>
      <PageHeader
        title="Tài khoản"
        extra={
          <>
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportXlsx}>
              Xuất Excel
            </Button>
            {can('system.user.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
                Thêm tài khoản
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="bm-filters">
          <Input.Search placeholder="Tìm tên, tài khoản, email" allowClear onSearch={(v) => setFilter('search', v)} style={{ width: 260 }} />
          <Select
            allowClear
            placeholder="Trạng thái"
            options={USER_STATUSES.map((s) => ({ value: s, label: USER_STATUS_LABELS[s] }))}
            onChange={(v) => setFilter('status', v)}
          />
          <Select
            allowClear
            placeholder="Nhóm tài khoản"
            options={roles?.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(v) => setFilter('roleId', v)}
          />
          <Select
            allowClear
            placeholder="Cơ sở"
            options={campuses?.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => setFilter('campusId', v)}
          />
          <TreeSelect
            allowClear
            showSearch
            treeNodeFilterProp="title"
            placeholder="Đơn vị"
            treeData={units ? buildUnitTree(units) : []}
            onChange={(v) => setFilter('unitId', v)}
            style={{ width: 240 }}
          />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `${t} tài khoản`,
            onChange: (p, s) => setPage({ page: p, pageSize: s }),
          }}
        />
      </Card>
      <UserFormDrawer
        open={editing !== null}
        user={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(username, temporaryPassword) => {
          setEditing(null);
          refresh();
          if (temporaryPassword) showPassword(username, temporaryPassword);
          else message.success('Đã lưu tài khoản');
        }}
      />
    </>
  );
}
