'use client';

import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, Modal, Progress, Table, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { money, monthLabel, RUN_STATUS, type PayrollRun, type RunStatus } from '@/lib/payroll';

export default function PayrollRunsPage() {
  const can = useCan();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api<PayrollRun[]>('/payroll/runs'),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'CALCULATING') ? 3000 : false),
  });
  return (
    <>
      <PageHeader
        title="Bảng lương tháng"
        extra={can('payroll.run') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Tạo kỳ lương</Button>}
      />
      <Card>
        <Table
          rowKey="id"
          loading={isFetching && !data}
          dataSource={data}
          scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => router.push(`/payroll/runs/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Mã kỳ', dataIndex: 'code', width: 130 },
            { title: 'Tháng', dataIndex: 'month', render: monthLabel, width: 90 },
            { title: 'Tên', dataIndex: 'name' },
            {
              title: 'Trạng thái',
              key: 's',
              render: (_, r) =>
                r.status === 'CALCULATING' ? (
                  <Progress percent={r.employeeCount ? Math.round((r.progress / r.employeeCount) * 100) : 0} size="small" style={{ width: 140 }} />
                ) : (
                  <Tag color={RUN_STATUS[r.status as RunStatus].color}>{RUN_STATUS[r.status as RunStatus].label}</Tag>
                ),
            },
            { title: 'Số NV', dataIndex: 'employeeCount', align: 'right' },
            { title: 'Lỗi', dataIndex: 'errorCount', align: 'right', render: (v: number) => (v ? <Tag color="warning">{v}</Tag> : 0) },
            { title: 'Tổng thu nhập', key: 'g', align: 'right', render: (_, r) => money(r.totals?.gross) },
            { title: 'Thực lĩnh', key: 'n', align: 'right', render: (_, r) => money(r.totals?.net) },
            { title: 'Tính lúc', dataIndex: 'calculatedAt', render: formatDateTime, responsive: ['xl'] },
            { title: 'Chốt lúc', dataIndex: 'closedAt', render: formatDateTime, responsive: ['xl'] },
          ]}
        />
      </Card>
      <CreateRunModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/payroll/runs/${id}`)} />
    </>
  );
}

function CreateRunModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const submit = async (v: { month: Dayjs; name: string; note?: string }) => {
    setSaving(true);
    try {
      const r = await api<PayrollRun>('/payroll/runs', { method: 'POST', body: { month: v.month.format('YYYY-MM'), name: v.name, note: v.note ?? '' } });
      message.success(`Đã tạo kỳ lương ${r.code}`);
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      onClose();
      onCreated(r.id);
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const lastMonth = dayjs().subtract(1, 'month');
  return (
    <Modal open={open} title="Tạo kỳ lương" onCancel={onClose} onOk={() => form.submit()} okText="Tạo" confirmLoading={saving} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{ month: lastMonth, name: `Bảng lương tháng ${lastMonth.format('MM/YYYY')}` }}
        onValuesChange={(c: { month?: Dayjs }) => c.month && form.setFieldValue('name', `Bảng lương tháng ${c.month.format('MM/YYYY')}`)}
      >
        <Form.Item name="month" label="Tháng lương" rules={[{ required: true }]}>
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} />
        </Form.Item>
        <Form.Item name="name" label="Tên kỳ lương" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
