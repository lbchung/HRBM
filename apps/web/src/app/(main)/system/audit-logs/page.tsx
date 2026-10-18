'use client';

import { EyeOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Input, Modal, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface AuditRow {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

const ACTIONS: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Thêm mới', color: 'green' },
  UPDATE: { label: 'Cập nhật', color: 'blue' },
  DELETE: { label: 'Xóa', color: 'red' },
  LOGIN: { label: 'Đăng nhập', color: 'cyan' },
  LOGOUT: { label: 'Đăng xuất', color: 'default' },
  LOGIN_FAILED: { label: 'Đăng nhập sai', color: 'orange' },
  LOGIN_LOCKED: { label: 'Tạm khóa do sai mật khẩu', color: 'volcano' },
  CHANGE_PASSWORD: { label: 'Đổi mật khẩu', color: 'purple' },
  RESET_PASSWORD: { label: 'Đặt lại mật khẩu', color: 'purple' },
  LOCK: { label: 'Khóa tài khoản', color: 'red' },
  UNLOCK: { label: 'Mở khóa', color: 'green' },
  ENABLE_2FA: { label: 'Bật 2FA', color: 'geekblue' },
  DISABLE_2FA: { label: 'Tắt 2FA', color: 'orange' },
  RESET_2FA: { label: 'Đặt lại 2FA', color: 'orange' },
  CREATE_ACCOUNT: { label: 'Tạo tài khoản NV', color: 'green' },
  IMPORT: { label: 'Import Excel', color: 'blue' },
  SUBMIT: { label: 'Gửi phiếu', color: 'blue' },
  APPROVE: { label: 'Duyệt', color: 'green' },
  REJECT: { label: 'Từ chối', color: 'red' },
  CANCEL: { label: 'Hủy phiếu', color: 'default' },
  SYNC_FAILED: { label: 'Đồng bộ lỗi', color: 'red' },
};

const ENTITIES: Record<string, string> = {
  auth: 'Xác thực',
  user: 'Tài khoản',
  role: 'Nhóm tài khoản',
  campus: 'Cơ sở',
  unit: 'Đơn vị',
  catalog: 'Danh mục',
  policy_parameter: 'Tham số chính sách',
  approval: 'Phiếu duyệt',
  approval_workflow: 'Quy trình duyệt',
  integration_ownership: 'Nguồn dữ liệu chuẩn',
  integration: 'Kết nối Fast',
  employee: 'Hồ sơ nhân viên',
  'employee.family': 'NV — Gia đình',
  'employee.work-history': 'NV — Quá trình công tác',
  'employee.contracts': 'NV — Hợp đồng',
  'employee.assignments': 'NV — Phân công cơ sở',
  'employee.documents': 'NV — Tài liệu',
  'employee.trainings': 'NV — Đào tạo',
  'employee.rewards': 'NV — Khen thưởng',
  'employee.disciplines': 'NV — Kỷ luật',
  'employee.salaries': 'NV — Lương',
  'employee.allowances': 'NV — Phụ cấp',
  'employee.income-coefficients': 'NV — Hệ số thu nhập',
};

const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** So sánh trước/sau theo từng trường cấp 1. */
function DiffTable({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const rows = keys
    .map((k) => ({ key: k, before: show(before?.[k]), after: show(after?.[k]) }))
    .filter((r) => !before || !after || r.before !== r.after);
  if (!rows.length) return <Typography.Text type="secondary">Không có dữ liệu chi tiết</Typography.Text>;
  return (
    <Table
      size="small"
      rowKey="key"
      pagination={false}
      dataSource={rows}
      scroll={{ x: 'max-content' }}
      columns={[
        { title: 'Trường', dataIndex: 'key', width: 160 },
        ...(before ? [{ title: 'Trước', dataIndex: 'before', render: (v: string) => <Typography.Text type="danger" style={{ wordBreak: 'break-all' }}>{v}</Typography.Text> }] : []),
        ...(after ? [{ title: 'Sau', dataIndex: 'after', render: (v: string) => <Typography.Text type="success" style={{ wordBreak: 'break-all' }}>{v}</Typography.Text> }] : []),
      ]}
    />
  );
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<{ search?: string; entity?: string; action?: string; from?: string; to?: string }>({});
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: () => api<Paginated<AuditRow>>('/audit-logs', { query: { ...filters, ...page } }),
    placeholderData: keepPreviousData,
  });

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage((p) => ({ ...p, page: 1 }));
  };

  const columns: ColumnsType<AuditRow> = [
    { title: 'Thời gian', dataIndex: 'createdAt', render: formatDateTime, width: 150 },
    { title: 'Người thực hiện', dataIndex: 'username', render: (v) => v ?? '—' },
    {
      title: 'Hành động',
      dataIndex: 'action',
      render: (a: string) => <Tag color={ACTIONS[a]?.color}>{ACTIONS[a]?.label ?? a}</Tag>,
    },
    { title: 'Đối tượng', dataIndex: 'entity', render: (e: string) => ENTITIES[e] ?? e },
    { title: 'IP', dataIndex: 'ip', responsive: ['lg'] },
    {
      title: '',
      key: 'view',
      width: 50,
      render: (_, r) => <Button type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} aria-label="Xem chi tiết" />,
    },
  ];

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" />
      <Card>
        <div className="bm-filters">
          <Input.Search placeholder="Tìm người thực hiện, ID" allowClear onSearch={(v) => setFilter({ search: v || undefined })} style={{ width: 240 }} />
          <Select allowClear placeholder="Đối tượng" options={Object.entries(ENTITIES).map(([value, label]) => ({ value, label }))} onChange={(v) => setFilter({ entity: v })} />
          <Select allowClear placeholder="Hành động" options={Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label }))} onChange={(v) => setFilter({ action: v })} />
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            onChange={(r) => {
              const [from, to] = (r ?? []) as [Dayjs | null, Dayjs | null];
              setFilter({ from: from?.startOf('day').toISOString(), to: to?.endOf('day').toISOString() });
            }}
          />
        </div>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={data?.items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `${t} bản ghi`,
            onChange: (p, s) => setPage({ page: p, pageSize: s }),
          }}
        />
      </Card>
      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} width={800} title="Chi tiết nhật ký">
        {detail && (
          <>
            <Typography.Paragraph>
              <b>{detail.username ?? '—'}</b> · <Tag color={ACTIONS[detail.action]?.color}>{ACTIONS[detail.action]?.label ?? detail.action}</Tag>
              {ENTITIES[detail.entity] ?? detail.entity} · {formatDateTime(detail.createdAt)}
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ID: {detail.entityId ?? '—'} · IP: {detail.ip ?? '—'} · {detail.userAgent ?? ''}
              </Typography.Text>
            </Typography.Paragraph>
            <DiffTable before={detail.before} after={detail.after} />
          </>
        )}
      </Modal>
    </>
  );
}
