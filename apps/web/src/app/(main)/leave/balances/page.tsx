'use client';

import { EditOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, InputNumber, Modal, Table, Tag, TreeSelect, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useCampusFilter } from '@/lib/campus-filter';
import { errorMessage } from '@/lib/form';
import { formatNumber } from '@/lib/format';
import { buildUnitTree, useUnits } from '@/lib/queries';

interface Balance {
  id: string;
  code: string;
  fullName: string;
  unit: { name: string };
  year: number;
  entitled: string;
  carriedOver: string;
  adjustment: string;
  used: string;
  pending: string;
  remaining: string;
  note: string | null;
  initialized: boolean;
}

export default function LeaveBalancesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const canEdit = can('leave.type.manage');
  const { campusId } = useCampusFilter();
  const { data: units } = useUnits();
  const [year, setYear] = useState(dayjs().year());
  const [unitId, setUnitId] = useState<string>();
  const [search, setSearch] = useState<string>();
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const [editing, setEditing] = useState<Balance | null>(null);
  const [form] = Form.useForm();
  const query = { year, unitId, campusId, search };
  const { data, isFetching } = useQuery({
    queryKey: ['leave-balances', query, page],
    queryFn: () => api<Paginated<Balance>>('/leave/balances', { query: { ...query, ...page } }),
    placeholderData: keepPreviousData,
  });

  const init = () =>
    modal.confirm({
      title: `Khởi tạo quỹ phép năm ${year}?`,
      content: 'Tạo quỹ phép cho các nhân viên chưa có: số ngày cơ bản (tham số chính sách) + 1 ngày cho mỗi đủ 5 năm công tác. Không ghi đè quỹ đã có.',
      onOk: async () => {
        const r = await api<{ created: number }>('/leave/balances/init', { method: 'POST', body: { year } });
        message.success(`Đã khởi tạo ${r.created} quỹ phép`);
        queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      },
    });

  const save = async (v: { entitledDays: string; carriedOverDays: string; adjustmentDays: string; note?: string }) => {
    if (!editing) return;
    try {
      await api(`/leave/balances/${editing.id}/${year}`, { method: 'PATCH', body: { ...v, note: v.note ?? '' } });
      message.success('Đã cập nhật quỹ phép');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Quỹ phép năm" extra={canEdit && <Button type="primary" icon={<ThunderboltOutlined />} onClick={init}>Khởi tạo quỹ phép {year}</Button>} />
      <Card>
        <div className="bm-filters">
          <InputNumber value={year} min={2020} max={2100} onChange={(v) => v && setYear(v)} />
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Đơn vị" treeData={units ? buildUnitTree(units) : []} onChange={setUnitId} style={{ width: 260 }} />
          <Input.Search placeholder="Tìm mã, tên" allowClear onSearch={(v) => setSearch(v || undefined)} style={{ width: 240 }} />
        </div>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Còn lại = được hưởng + chuyển từ năm trước + điều chỉnh − đã nghỉ (phiếu đã duyệt, loại "trừ phép năm"). ⚠ Quy tắc thâm niên +1 ngày/5 năm cần TCCB xác nhận.
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          loading={isFetching}
          dataSource={data?.items}
          scroll={{ x: 'max-content' }}
          pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
          columns={[
            { title: 'Nhân viên', key: 'e', render: (_, b) => <>{b.fullName} <Typography.Text type="secondary">({b.code})</Typography.Text></> },
            { title: 'Đơn vị', key: 'u', render: (_, b) => b.unit.name },
            { title: 'Được hưởng', dataIndex: 'entitled', align: 'right', render: (v, b) => <>{formatNumber(v)}{!b.initialized && <Tag style={{ marginLeft: 4 }}>tạm tính</Tag>}</> },
            { title: 'Chuyển sang', dataIndex: 'carriedOver', align: 'right', render: (v) => formatNumber(v) },
            { title: 'Điều chỉnh', dataIndex: 'adjustment', align: 'right', render: (v) => formatNumber(v) },
            { title: 'Đã nghỉ', dataIndex: 'used', align: 'right', render: (v) => formatNumber(v) },
            { title: 'Chờ duyệt', dataIndex: 'pending', align: 'right', render: (v) => (Number(v) ? <Tag color="processing">{formatNumber(v)}</Tag> : '0') },
            { title: 'Còn lại', dataIndex: 'remaining', align: 'right', render: (v) => <b style={{ color: Number(v) < 0 ? '#cf1322' : undefined }}>{formatNumber(v)}</b> },
            ...(canEdit ? [{ title: '', key: 'a', width: 50, render: (_: unknown, b: Balance) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(b)} /> }] : []),
          ]}
        />
      </Card>
      <Modal open={!!editing} title={`Quỹ phép ${year}: ${editing?.fullName ?? ''}`} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          key={editing?.id}
          initialValues={editing ? { entitledDays: editing.entitled, carriedOverDays: editing.carriedOver, adjustmentDays: editing.adjustment, note: editing.note ?? undefined } : undefined}
        >
          <Form.Item name="entitledDays" label="Được hưởng (ngày)"><InputNumber<string> stringMode step="0.5" style={{ width: 160 }} /></Form.Item>
          <Form.Item name="carriedOverDays" label="Chuyển từ năm trước (ngày)"><InputNumber<string> stringMode step="0.5" style={{ width: 160 }} /></Form.Item>
          <Form.Item name="adjustmentDays" label="Điều chỉnh (+/− ngày)"><InputNumber<string> stringMode step="0.5" style={{ width: 160 }} /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
