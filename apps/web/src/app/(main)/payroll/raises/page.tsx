'use client';

import { CheckOutlined, CloseOutlined, DeleteOutlined, FileExcelOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, TreeSelect, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { EmployeeSelect } from '@/components/EmployeeSelect';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDay, formatNumber, fromDayjs } from '@/lib/format';
import { RAISE_KINDS, type RaiseKind } from '@/lib/payroll';
import { buildUnitTree, useUnits } from '@/lib/queries';

interface DueRow {
  employeeId: string;
  code: string;
  fullName: string;
  unitName: string;
  salaryScale: string;
  fromStep: number;
  fromCoefficient: string | null;
  fromBeyondPct: string;
  since: string;
  kind: RaiseKind;
  toStep: number;
  toCoefficient: string;
  toBeyondPct: string;
  dueDate: string;
  disciplineDelayMonths: number;
  unpaidLeaveDays: number;
}
type RaiseStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';
interface RaiseRow {
  id: string;
  kind: RaiseKind;
  fromStep: number | null;
  toStep: number | null;
  fromCoefficient: string | null;
  toCoefficient: string | null;
  fromBeyondPct: string | null;
  toBeyondPct: string | null;
  dueDate: string;
  effectiveDate: string;
  status: RaiseStatus;
  reason: string | null;
  decisionNo: string | null;
  decisionDate: string | null;
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
}
const STATUS: Record<RaiseStatus, { label: string; color: string }> = {
  PROPOSED: { label: 'Đề xuất', color: 'processing' },
  APPROVED: { label: 'Đã duyệt', color: 'success' },
  REJECTED: { label: 'Từ chối', color: 'error' },
};
const pct = (v?: string | null) => (Number(v ?? 0) ? `VK ${formatNumber(v)}%` : '');
const level = (step: number | null, coef: string | null, beyond: string | null) => `Bậc ${step ?? '?'} · ${formatNumber(coef)} ${pct(beyond)}`;

export default function RaisesPage() {
  const [tab, setTab] = useState('due');
  return (
    <>
      <PageHeader title="Nâng lương" />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'due', label: 'Danh sách đến hạn', children: <DueTab onProposed={() => setTab('list')} /> },
          { key: 'list', label: 'Đề xuất & quyết định', children: <ListTab /> },
        ]}
      />
    </>
  );
}

function DueTab({ onProposed }: { onProposed: () => void }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: units } = useUnits();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().add(2, 'month').endOf('month')]);
  const [unitId, setUnitId] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [early, setEarly] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['raises-due', fromDayjs(range[0]), fromDayjs(range[1]), unitId],
    queryFn: () => api<DueRow[]>('/payroll/raises/due', { query: { from: fromDayjs(range[0]), to: fromDayjs(range[1]), unitId } }),
  });
  const propose = async () => {
    const items = (data ?? [])
      .filter((r) => selected.includes(r.employeeId))
      .map((r) => ({ employeeId: r.employeeId, kind: r.kind, toStep: r.toStep, toCoefficient: r.toCoefficient, toBeyondPct: r.toBeyondPct, dueDate: r.dueDate, effectiveDate: r.dueDate, reason: null }));
    try {
      const r = await api<{ created: number }>('/payroll/raises', { method: 'POST', body: { items } });
      message.success(`Đã lập ${r.created} đề xuất nâng lương`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['raises-due'] });
      qc.invalidateQueries({ queryKey: ['raises'] });
      onProposed();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <Card>
      <div className="bm-filters">
        <DatePicker.RangePicker format="DD/MM/YYYY" allowClear={false} value={range} onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])} />
        <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Tất cả đơn vị" style={{ width: 260 }} value={unitId} onChange={setUnitId} treeData={units ? buildUnitTree(units) : []} />
        <Button type="primary" icon={<SendOutlined />} disabled={!selected.length} onClick={propose}>Lập đề xuất ({selected.length})</Button>
        <Button icon={<PlusOutlined />} onClick={() => setEarly(true)}>Nâng lương trước hạn</Button>
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Hạn nâng lương tính từ ngày hưởng bậc hiện tại + thời gian giữ bậc của thang lương (theo chức danh), cộng thêm thời gian kéo dài do kỷ luật và nghỉ không lương từ 30 ngày. Nhân viên đang có đề xuất chờ duyệt không hiển thị."
      />
      <Table
        rowKey="employeeId"
        size="small"
        loading={isFetching}
        dataSource={data}
        scroll={{ x: 'max-content' }}
        rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]) }}
        pagination={{ pageSize: 50 }}
        columns={[
          { title: 'Mã NV', dataIndex: 'code', width: 100 },
          { title: 'Họ tên', dataIndex: 'fullName' },
          { title: 'Đơn vị', dataIndex: 'unitName', responsive: ['lg'] },
          { title: 'Thang', dataIndex: 'salaryScale', width: 70 },
          { title: 'Hiện hưởng', key: 'f', render: (_, r) => level(r.fromStep, r.fromCoefficient, r.fromBeyondPct) },
          { title: 'Từ ngày', dataIndex: 'since', render: formatDay },
          { title: 'Loại', dataIndex: 'kind', render: (k: RaiseKind) => <Tag color={k === 'BEYOND_SCALE' ? 'gold' : 'green'}>{RAISE_KINDS[k]}</Tag> },
          { title: 'Đề xuất', key: 't', render: (_, r) => <b>{level(r.toStep, r.toCoefficient, r.toBeyondPct)}</b> },
          { title: 'Đến hạn', dataIndex: 'dueDate', render: formatDay },
          {
            title: 'Kéo dài',
            key: 'd',
            render: (_, r) => (
              <>
                {r.disciplineDelayMonths > 0 && <Tag color="red">Kỷ luật {r.disciplineDelayMonths} tháng</Tag>}
                {r.unpaidLeaveDays >= 30 && <Tag color="orange">Nghỉ KL {r.unpaidLeaveDays} ngày</Tag>}
              </>
            ),
          },
        ]}
      />
      <EarlyRaiseModal open={early} onClose={() => setEarly(false)} onDone={onProposed} />
    </Card>
  );
}

function EarlyRaiseModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const submit = async (v: { employeeId: string; toStep: number; toCoefficient: number; effectiveDate: Dayjs; reason: string }) => {
    try {
      await api('/payroll/raises', {
        method: 'POST',
        body: { items: [{ employeeId: v.employeeId, kind: 'EARLY', toStep: v.toStep, toCoefficient: String(v.toCoefficient), toBeyondPct: '0', dueDate: fromDayjs(v.effectiveDate), effectiveDate: fromDayjs(v.effectiveDate), reason: v.reason }] },
      });
      message.success('Đã lập đề xuất nâng lương trước hạn');
      qc.invalidateQueries({ queryKey: ['raises'] });
      form.resetFields();
      onClose();
      onDone();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} title="Đề xuất nâng lương trước hạn (thành tích)" onCancel={onClose} onOk={() => form.submit()} okText="Lập đề xuất" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="employeeId" label="Nhân viên" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
          <EmployeeSelect />
        </Form.Item>
        <Space>
          <Form.Item name="toStep" label="Lên bậc" rules={[{ required: true }]}>
            <InputNumber min={1} max={30} />
          </Form.Item>
          <Form.Item name="toCoefficient" label="Hệ số mới" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} precision={3} />
          </Form.Item>
          <Form.Item name="effectiveDate" label="Ngày hưởng" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
        </Space>
        <Form.Item name="reason" label="Thành tích / căn cứ" rules={[{ required: true, message: 'Nhập căn cứ' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ListTab() {
  const can = useCan();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState<RaiseStatus | undefined>('PROPOSED');
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const [selected, setSelected] = useState<string[]>([]);
  const [deciding, setDeciding] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['raises', status, page],
    queryFn: () => api<Paginated<RaiseRow>>('/payroll/raises', { query: { status, ...page } }),
    placeholderData: keepPreviousData,
  });
  const invalidate = () => {
    setSelected([]);
    qc.invalidateQueries({ queryKey: ['raises'] });
    qc.invalidateQueries({ queryKey: ['raises-due'] });
  };
  const reject = () =>
    modal.confirm({
      title: `Từ chối ${selected.length} đề xuất?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api('/payroll/raises/decide', { method: 'POST', body: { ids: selected, approve: false, decisionNo: null, decisionDate: null } });
          message.success('Đã từ chối');
          invalidate();
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  const remove = (id: string) =>
    modal.confirm({
      title: 'Xóa đề xuất?',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api(`/payroll/raises/${id}`, { method: 'DELETE' }).catch((e) => message.error(errorMessage(e)));
        invalidate();
      },
    });
  const canDecide = can('hr.salary.manage');
  return (
    <Card>
      <div className="bm-filters">
        <Select allowClear placeholder="Trạng thái" value={status} onChange={(v) => { setStatus(v); setSelected([]); }} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} style={{ width: 160 }} />
        {status === 'PROPOSED' && canDecide && (
          <>
            <Button type="primary" icon={<CheckOutlined />} disabled={!selected.length} onClick={() => setDeciding(true)}>Duyệt ({selected.length})</Button>
            <Button danger icon={<CloseOutlined />} disabled={!selected.length} onClick={reject}>Từ chối</Button>
          </>
        )}
        <Button icon={<FileExcelOutlined />} onClick={() => downloadFile('/payroll/raises', { status, export: 'xlsx' }).catch((e) => message.error(errorMessage(e)))}>Xuất Excel</Button>
      </div>
      {status === 'PROPOSED' && !canDecide && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Phòng TCCB (quyền cập nhật diễn biến lương) duyệt quyết định nâng lương." />}
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.items}
        scroll={{ x: 'max-content' }}
        rowSelection={status === 'PROPOSED' && canDecide ? { selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]) } : undefined}
        pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
        columns={[
          { title: 'Mã NV', key: 'c', render: (_, r) => r.employee.code, width: 100 },
          { title: 'Họ tên', key: 'n', render: (_, r) => r.employee.fullName },
          { title: 'Đơn vị', key: 'u', render: (_, r) => r.employee.unit.name, responsive: ['lg'] },
          { title: 'Loại', dataIndex: 'kind', render: (k: RaiseKind) => RAISE_KINDS[k] },
          { title: 'Cũ', key: 'f', render: (_, r) => level(r.fromStep, r.fromCoefficient, r.fromBeyondPct) },
          { title: 'Mới', key: 't', render: (_, r) => <b>{level(r.toStep, r.toCoefficient, r.toBeyondPct)}</b> },
          { title: 'Hiệu lực', dataIndex: 'effectiveDate', render: formatDay },
          { title: 'Trạng thái', dataIndex: 'status', render: (s: RaiseStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
          { title: 'Quyết định', key: 'q', render: (_, r) => (r.decisionNo ? `${r.decisionNo}${r.decisionDate ? ` (${formatDay(r.decisionDate)})` : ''}` : '') },
          { title: 'Căn cứ', dataIndex: 'reason', responsive: ['xl'] },
          {
            key: 'a',
            width: 50,
            render: (_, r) => r.status === 'PROPOSED' && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(r.id)} />,
          },
        ]}
      />
      <DecideModal open={deciding} ids={selected} onClose={() => setDeciding(false)} onDone={invalidate} />
    </Card>
  );
}

function DecideModal({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const submit = async (v: { decisionNo: string; decisionDate?: Dayjs }) => {
    try {
      await api('/payroll/raises/decide', { method: 'POST', body: { ids, approve: true, decisionNo: v.decisionNo, decisionDate: v.decisionDate ? fromDayjs(v.decisionDate) : null } });
      message.success(`Đã duyệt ${ids.length} quyết định — diễn biến lương mới đã được tạo`);
      form.resetFields();
      onClose();
      onDone();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} title={`Duyệt ${ids.length} quyết định nâng lương`} onCancel={onClose} onOk={() => form.submit()} okText="Duyệt" destroyOnHidden>
      <Typography.Paragraph type="secondary">
        Hệ thống tạo diễn biến lương mới theo ngày hiệu lực. Nếu ngày hiệu lực thuộc kỳ lương đã chốt, khoản <b>truy lĩnh</b> được tính tự động và đưa vào kỳ lương kế tiếp.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ decisionDate: dayjs() }}>
        <Form.Item name="decisionNo" label="Số quyết định" rules={[{ required: true, message: 'Nhập số quyết định' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="decisionDate" label="Ngày quyết định">
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
