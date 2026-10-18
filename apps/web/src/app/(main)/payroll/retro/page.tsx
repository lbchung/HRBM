'use client';

import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Modal, Select, Table, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { EmployeeSelect } from '@/components/EmployeeSelect';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/form';
import { formatDateTime, formatNumber } from '@/lib/format';
import { money, monthLabel } from '@/lib/payroll';

type RetroStatus = 'PENDING' | 'INCLUDED' | 'CANCELLED';
interface RetroDetail {
  month: string;
  runCode: string;
  paidVars: Record<string, string>;
  newVars: Record<string, string>;
  oldGross: string;
  newGross: string;
  amount: string;
  insAmount: string;
}
interface RetroRow {
  id: string;
  reason: string;
  fromMonth: string;
  toMonth: string;
  amount: string;
  insAmount: string;
  status: RetroStatus;
  details: RetroDetail[];
  updatedAt: string;
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
}
const STATUS: Record<RetroStatus, { label: string; color: string }> = {
  PENDING: { label: 'Chờ chi', color: 'processing' },
  INCLUDED: { label: 'Đã chi', color: 'success' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};
const VAR_LABEL: Record<string, string> = { COEF: 'Hệ số', BEYOND_PCT: 'Vượt khung %', FIXED_AMOUNT: 'Lương khoán', STAB_COEF: 'HS ổn định', MGMT_COEF: 'HS quản lý', OTHER_COEF: 'HS khác' };

/** Các biến thay đổi giữa lần đã chi và hồ sơ mới */
function changes(d: RetroDetail) {
  return Object.keys({ ...d.paidVars, ...d.newVars })
    .filter((k) => (d.paidVars[k] ?? '0') !== (d.newVars[k] ?? '0') && Number(d.paidVars[k] ?? 0) !== Number(d.newVars[k] ?? 0))
    .map((k) => `${VAR_LABEL[k] ?? k.replace(/^ALLOW_/, 'PC ')}: ${formatNumber(d.paidVars[k] ?? 0)} → ${formatNumber(d.newVars[k] ?? 0)}`);
}

export default function RetroPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState<RetroStatus | undefined>('PENDING');
  const [manual, setManual] = useState(false);
  const { data, isFetching } = useQuery({ queryKey: ['retro', status], queryFn: () => api<RetroRow[]>('/payroll/retro', { query: { status } }) });
  const cancel = (r: RetroRow) =>
    modal.confirm({
      title: `Hủy truy lĩnh của ${r.employee.fullName}?`,
      content: 'Khoản truy lĩnh sẽ không đưa vào kỳ lương. Có thể tính lại thủ công sau.',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/payroll/retro/${r.id}/cancel`, { method: 'POST' });
          qc.invalidateQueries({ queryKey: ['retro'] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  return (
    <>
      <PageHeader title="Truy lĩnh lương, phụ cấp" extra={<Button icon={<ReloadOutlined />} onClick={() => setManual(true)}>Tính lại thủ công</Button>} />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Truy lĩnh được tính tự động khi diễn biến lương, phụ cấp, hệ số thu nhập hoặc quyết định nâng lương có hiệu lực vào kỳ lương đã chốt. Mỗi kỳ tính lại với lương cơ sở và tỷ lệ bảo hiểm có hiệu lực tại kỳ đó; khoản chờ chi được đưa vào kỳ lương kế tiếp."
      />
      <Card>
        <div className="bm-filters">
          <Select allowClear placeholder="Trạng thái" value={status} onChange={setStatus} style={{ width: 160 }} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={isFetching}
          dataSource={data}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                rowKey="month"
                size="small"
                pagination={false}
                dataSource={r.details}
                columns={[
                  { title: 'Kỳ', dataIndex: 'month', render: monthLabel, width: 80 },
                  { title: 'Bảng lương', dataIndex: 'runCode', width: 120 },
                  { title: 'Thay đổi', key: 'c', render: (_, d) => changes(d).map((c) => <div key={c}>{c}</div>) },
                  { title: 'Thu nhập đã chi', dataIndex: 'oldGross', align: 'right', render: money },
                  { title: 'Thu nhập mới', dataIndex: 'newGross', align: 'right', render: money },
                  { title: 'Truy lĩnh', dataIndex: 'amount', align: 'right', render: (v: string) => <b>{money(v)}</b> },
                  { title: 'Truy thu BH', dataIndex: 'insAmount', align: 'right', render: money },
                ]}
              />
            ),
          }}
          columns={[
            { title: 'Mã NV', key: 'c', render: (_, r) => r.employee.code, width: 100 },
            { title: 'Họ tên', key: 'n', render: (_, r) => r.employee.fullName },
            { title: 'Đơn vị', key: 'u', render: (_, r) => r.employee.unit.name, responsive: ['lg'] },
            { title: 'Lý do', dataIndex: 'reason' },
            { title: 'Kỳ', key: 'p', render: (_, r) => (r.fromMonth === r.toMonth ? monthLabel(r.fromMonth) : `${monthLabel(r.fromMonth)} – ${monthLabel(r.toMonth)}`) },
            { title: 'Truy lĩnh', dataIndex: 'amount', align: 'right', render: (v: string) => <b>{money(v)}</b> },
            { title: 'Truy thu BH', dataIndex: 'insAmount', align: 'right', render: money },
            { title: 'Trạng thái', dataIndex: 'status', render: (s: RetroStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
            { title: 'Cập nhật', dataIndex: 'updatedAt', render: formatDateTime, responsive: ['xl'] },
            { key: 'a', width: 50, render: (_, r) => r.status === 'PENDING' && <Button size="small" type="text" danger icon={<StopOutlined />} onClick={() => cancel(r)} /> },
          ]}
        />
      </Card>
      <ManualModal open={manual} onClose={() => setManual(false)} />
    </>
  );
}

function ManualModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const submit = async (v: { employeeId: string; fromMonth: Dayjs }) => {
    try {
      const r = await api<RetroRow | null>('/payroll/retro/recompute', { method: 'POST', body: { employeeId: v.employeeId, fromMonth: v.fromMonth.format('YYYY-MM') } });
      message.success(r ? `Truy lĩnh: ${money(r.amount)} đ` : 'Không có chênh lệch với các kỳ đã chốt');
      qc.invalidateQueries({ queryKey: ['retro'] });
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} title="Tính lại truy lĩnh" onCancel={onClose} onOk={() => form.submit()} okText="Tính" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ fromMonth: dayjs().subtract(3, 'month') }}>
        <Form.Item name="employeeId" label="Nhân viên" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
          <EmployeeSelect />
        </Form.Item>
        <Form.Item name="fromMonth" label="Từ kỳ lương" rules={[{ required: true }]}>
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
