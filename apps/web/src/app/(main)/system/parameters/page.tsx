'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { PARAMETER_UNIT_LABELS, type ParameterUnit } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDay, formatNumber } from '@/lib/format';

interface Version {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  value: string;
  legalBasis: string | null;
  note: string | null;
}
interface Param {
  code: string;
  name: string;
  group: string;
  unit: ParameterUnit;
  current: Version | null;
  versions: Version[];
}

const fmt = (v: string | undefined, unit: ParameterUnit) => (v === undefined ? '—' : `${formatNumber(v, 4)} ${PARAMETER_UNIT_LABELS[unit]}`.trim());
const today = () => dayjs().format('YYYY-MM-DD');

export default function ParametersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const canEdit = can('system.config.manage');
  const [adding, setAdding] = useState<Param | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['policy-parameters'], queryFn: () => api<Param[]>('/policy-parameters') });

  const remove = (v: Version) =>
    modal.confirm({
      title: 'Xóa phiên bản tham số',
      content: `Xóa phiên bản hiệu lực từ ${formatDay(v.effectiveFrom)}?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/policy-parameters/${v.id}`, { method: 'DELETE' });
          queryClient.invalidateQueries({ queryKey: ['policy-parameters'] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  const columns: ColumnsType<Param> = [
    { title: 'Nhóm', dataIndex: 'group', width: 120, responsive: ['md'] },
    {
      title: 'Tham số',
      key: 'name',
      render: (_, p) => (
        <>
          <Typography.Text strong>{p.name}</Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p.code}
          </Typography.Text>
        </>
      ),
    },
    { title: 'Giá trị hiện hành', key: 'value', render: (_, p) => (p.current ? <b>{fmt(p.current.value, p.unit)}</b> : <Tag color="red">Chưa khai báo</Tag>) },
    { title: 'Từ ngày', key: 'from', render: (_, p) => formatDay(p.current?.effectiveFrom) },
    { title: 'Căn cứ', key: 'basis', render: (_, p) => p.current?.legalBasis ?? '—', responsive: ['lg'] },
    ...(canEdit
      ? [{ title: '', key: 'a', width: 130, render: (_: unknown, p: Param) => <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(p)}>Phiên bản mới</Button> }]
      : []),
  ];

  return (
    <>
      <PageHeader title="Tham số chính sách" />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Tham số theo ngày hiệu lực"
        description="Khi chính sách thay đổi, thêm phiên bản mới với ngày hiệu lực — không sửa giá trị cũ. Tính lương, thuế, truy lĩnh của từng kỳ dùng giá trị có hiệu lực tại kỳ đó. Dữ liệu khởi tạo cần Phòng TCKT rà soát."
      />
      <Card>
        <Table
          rowKey="code"
          columns={columns}
          dataSource={data}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowRender: (p) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={p.versions}
                columns={[
                  { title: 'Hiệu lực từ', dataIndex: 'effectiveFrom', render: formatDay },
                  { title: 'Đến', dataIndex: 'effectiveTo', render: (v) => (v ? formatDay(v) : 'nay') },
                  { title: 'Giá trị', dataIndex: 'value', render: (v) => fmt(v, p.unit) },
                  { title: 'Căn cứ', dataIndex: 'legalBasis', render: (v) => v ?? '—' },
                  { title: 'Ghi chú', dataIndex: 'note', render: (v) => v ?? '—' },
                  {
                    title: '',
                    key: 'a',
                    width: 50,
                    render: (_, v: Version) =>
                      canEdit && v.effectiveFrom.slice(0, 10) > today() ? <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(v)} aria-label="Xóa" /> : null,
                  },
                ]}
              />
            ),
          }}
        />
      </Card>
      <VersionModal param={adding} onClose={() => setAdding(null)} />
    </>
  );
}

function VersionModal({ param, onClose }: { param: Param | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const submit = async (v: { effectiveFrom: Dayjs; value: string; legalBasis?: string; note?: string }) => {
    if (!param) return;
    setSaving(true);
    try {
      await api('/policy-parameters', {
        method: 'POST',
        body: { code: param.code, effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'), value: v.value, legalBasis: v.legalBasis ?? '', note: v.note ?? '' },
      });
      message.success('Đã thêm phiên bản');
      queryClient.invalidateQueries({ queryKey: ['policy-parameters'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!param} title={`Phiên bản mới: ${param?.name ?? ''}`} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} key={param?.code}>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="effectiveFrom" label="Hiệu lực từ ngày" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="value" label={`Giá trị (${param ? PARAMETER_UNIT_LABELS[param.unit] || 'số' : ''})`} rules={[{ required: true, message: 'Nhập giá trị' }]}>
            <InputNumber<string> stringMode decimalSeparator="," style={{ width: 200 }} />
          </Form.Item>
        </Space>
        <Form.Item name="legalBasis" label="Căn cứ văn bản" rules={[{ required: true, message: 'Nhập căn cứ (số hiệu văn bản)' }]}>
          <Input placeholder="vd: Nghị định 73/2024/NĐ-CP" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
