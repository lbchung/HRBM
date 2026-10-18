'use client';

import { DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Input, Modal, Select, Table, Tabs, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useCampusFilter } from '@/lib/campus-filter';
import { errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';

interface Punch {
  id: string;
  punchTime: string;
  employeeNo: string;
  personName: string | null;
  verifyMode: string | null;
  device: { code: string; name: string };
  employee: { id: string; code: string; fullName: string; unit: { name: string } } | null;
}

export default function PunchesPage() {
  const can = useCan();
  return (
    <>
      <PageHeader title="Dữ liệu chấm Face ID" />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'all', label: 'Lượt quét', children: <PunchList /> },
          ...(can('attendance.device.manage') ? [{ key: 'unmapped', label: 'Mã chấm công chưa gắn nhân viên', children: <Unmapped /> }] : []),
        ]}
      />
    </>
  );
}

function PunchList() {
  const { message } = App.useApp();
  const { campusId } = useCampusFilter();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [search, setSearch] = useState<string>();
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const query = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), campusId, search };
  const { data, isFetching } = useQuery({
    queryKey: ['punches', query, page],
    queryFn: () => api<Paginated<Punch>>('/attendance/punches', { query: { ...query, ...page } }),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <div className="bm-filters">
        <DatePicker.RangePicker format="DD/MM/YYYY" value={range} allowClear={false} onChange={(r) => r?.[0] && r[1] && setRange([r[0], r[1]])} />
        <Input.Search placeholder="Tìm mã, tên nhân viên" allowClear onSearch={(v) => setSearch(v || undefined)} style={{ width: 260 }} />
        <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/attendance/punches', { ...query, export: 'xlsx' }).catch((e) => message.error(errorMessage(e)))}>
          Xuất Excel
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        dataSource={data?.items}
        loading={isFetching}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, showTotal: (t) => `${t.toLocaleString('vi-VN')} lượt`, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
        columns={[
          { title: 'Thời gian', dataIndex: 'punchTime', render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm:ss'), width: 170 },
          {
            title: 'Nhân viên',
            key: 'e',
            render: (_, p: Punch) =>
              p.employee ? (
                <Link href={`/hr/employees/${p.employee.id}`}>
                  {p.employee.fullName} <Typography.Text type="secondary">({p.employee.code})</Typography.Text>
                </Link>
              ) : (
                '—'
              ),
          },
          { title: 'Đơn vị', key: 'u', render: (_, p: Punch) => p.employee?.unit.name ?? '—', responsive: ['md'] },
          { title: 'Mã chấm công', dataIndex: 'employeeNo' },
          { title: 'Máy', key: 'd', render: (_, p: Punch) => p.device.name },
          { title: 'Phương thức', dataIndex: 'verifyMode', render: (v) => (v ? <Tag>{v}</Tag> : '—'), responsive: ['lg'] },
        ]}
      />
    </Card>
  );
}

interface UnmappedRow {
  employeeNo: string;
  count: number;
  lastPunch: string;
  personName: string | null;
}

function Unmapped() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [mapping, setMapping] = useState<UnmappedRow | null>(null);
  const [employeeId, setEmployeeId] = useState<string>();
  const [search, setSearch] = useState('');
  const { data, isFetching } = useQuery({ queryKey: ['punches', 'unmapped'], queryFn: () => api<UnmappedRow[]>('/attendance/punches/unmapped') });
  const { data: employees } = useQuery({
    queryKey: ['employees', 'pick', search],
    queryFn: () => api<Paginated<{ id: string; code: string; fullName: string; unit: { name: string } }>>('/hr/employees', { query: { search, pageSize: 30 } }),
    enabled: !!mapping,
  });

  const submit = async () => {
    if (!mapping || !employeeId) return;
    try {
      const r = await api<{ punches: number }>('/attendance/punches/map', { method: 'POST', body: { employeeNo: mapping.employeeNo, employeeId } });
      message.success(`Đã gắn mã ${mapping.employeeNo} — ${r.punches} lượt quét được cập nhật, bảng công đang tính lại`);
      setMapping(null);
      setEmployeeId(undefined);
      queryClient.invalidateQueries({ queryKey: ['punches'] });
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Card>
      <Typography.Paragraph type="secondary">
        Lượt quét có mã chấm công chưa khớp hồ sơ nào. Gắn mã cho nhân viên để tính công (mã được lưu vào hồ sơ, các lượt quét cũ tự cập nhật).
      </Typography.Paragraph>
      <Table
        rowKey="employeeNo"
        size="small"
        dataSource={data}
        loading={isFetching}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'Mã chấm công', dataIndex: 'employeeNo', render: (v) => <Tag color="orange">{v}</Tag> },
          { title: 'Tên trên máy', dataIndex: 'personName', render: (v) => v ?? '—' },
          { title: 'Số lượt quét', dataIndex: 'count', align: 'right' },
          { title: 'Quét gần nhất', dataIndex: 'lastPunch', render: formatDateTime },
          { title: '', key: 'a', width: 140, render: (_, r: UnmappedRow) => <Button size="small" icon={<LinkOutlined />} onClick={() => setMapping(r)}>Gắn nhân viên</Button> },
        ]}
      />
      <Modal open={!!mapping} title={`Gắn mã chấm công ${mapping?.employeeNo ?? ''}`} onCancel={() => setMapping(null)} onOk={submit} okButtonProps={{ disabled: !employeeId }} okText="Gắn" destroyOnHidden>
        <p>Tên trên máy: <b>{mapping?.personName ?? '—'}</b></p>
        <Select
          showSearch
          filterOption={false}
          onSearch={setSearch}
          value={employeeId}
          onChange={setEmployeeId}
          placeholder="Gõ mã hoặc tên nhân viên"
          style={{ width: '100%' }}
          options={employees?.items.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullName} (${e.unit.name})` }))}
        />
      </Modal>
    </Card>
  );
}
