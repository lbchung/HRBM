'use client';

import { EditOutlined, ExperimentOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { COMPONENT_KINDS, type ComponentKind } from '@bachmai/shared';
import { EmployeeSelect } from '@/components/EmployeeSelect';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDay, formatNumber, fromDayjs } from '@/lib/format';
import { money } from '@/lib/payroll';

interface Component {
  id: string;
  code: string;
  name: string;
  kind: ComponentKind;
  formula: string;
  taxable: boolean;
  roundDigits: number;
  sortOrder: number;
  showOnPayslip: boolean;
  description: string | null;
  isActive: boolean;
}
interface Variables {
  inputs: { name: string; description: string }[];
  allowances: { name: string; description: string }[];
  components: { name: string; description: string; sortOrder: number }[];
  functions: string[];
}
interface Scale { id: string; code: string; name: string; raiseIntervalMonths: number; isActive: boolean; steps: { step: number; coefficient: string }[] }
interface PitVersion { id: string; effectiveFrom: string; brackets: { upTo: string | null; rate: string }[]; legalBasis: string | null }

const KIND_COLOR: Record<ComponentKind, string> = { EARNING: 'green', DEDUCTION: 'red', EMPLOYER: 'purple', INFO: 'default' };

export default function PayrollConfigPage() {
  return (
    <>
      <PageHeader title="Cấu hình lương" extra={<Link href="/system/parameters"><Button>Tham số chính sách (lương cơ sở, tỷ lệ BH…)</Button></Link>} />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'components', label: 'Khoản lương & công thức', children: <ComponentsTab /> },
          { key: 'scales', label: 'Thang bảng lương', children: <ScalesTab /> },
          { key: 'pit', label: 'Biểu thuế TNCN', children: <PitTab /> },
        ]}
      />
    </>
  );
}

// ================= KHOẢN LƯƠNG =================

function ComponentsTab() {
  const [editing, setEditing] = useState<Component | 'new' | null>(null);
  const { data, isFetching } = useQuery({ queryKey: ['payroll-components'], queryFn: () => api<Component[]>('/payroll/components') });
  return (
    <Card>
      <div className="bm-filters">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>Thêm khoản</Button>
        <Typography.Text type="secondary">
          Các khoản được tính lần lượt theo <b>thứ tự</b>; công thức chỉ dùng được biến đầu vào, phụ cấp và mã các khoản đứng trước. Thêm / sửa khoản không cần sửa phần mềm.
        </Typography.Text>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        rowClassName={(r) => (r.isActive ? '' : 'bm-row-muted')}
        columns={[
          { title: 'TT', dataIndex: 'sortOrder', width: 60 },
          { title: 'Mã', dataIndex: 'code', width: 150, render: (c: string) => <Typography.Text code>{c}</Typography.Text> },
          { title: 'Tên khoản', dataIndex: 'name' },
          { title: 'Loại', dataIndex: 'kind', render: (k: ComponentKind) => <Tag color={KIND_COLOR[k]}>{COMPONENT_KINDS[k]}</Tag> },
          { title: 'Công thức', dataIndex: 'formula', render: (f: string) => <code style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{f}</code> },
          { title: 'Chịu thuế', dataIndex: 'taxable', render: (v: boolean) => (v ? <Tag color="orange">Có</Tag> : '') },
          { title: 'Trạng thái', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="success">Dùng</Tag> : <Tag>Ngừng</Tag>) },
          { key: 'a', width: 50, render: (_, r) => <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} /> },
        ]}
      />
      <ComponentModal value={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function ComponentModal({ value, onClose }: { value: Component | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isNew = value === 'new';
  const current = value && value !== 'new' ? value : null;
  const { data: vars } = useQuery({ queryKey: ['payroll-variables'], queryFn: () => api<Variables>('/payroll/variables'), enabled: !!value });
  const [testEmp, setTestEmp] = useState<string>();
  const [testMonth, setTestMonth] = useState<Dayjs>(dayjs().subtract(1, 'month'));
  const [testResult, setTestResult] = useState<{ valid: boolean; error: string | null; result: string | null } | null>(null);
  const sortOrder = Form.useWatch('sortOrder', form) as number | undefined;

  const test = async () => {
    const formula = form.getFieldValue('formula') as string;
    if (!formula) return;
    try {
      setTestResult(await api('/payroll/formula/test', { method: 'POST', body: { formula, employeeId: testEmp, month: testEmp ? testMonth.format('YYYY-MM') : undefined } }));
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const submit = async (v: Record<string, unknown>) => {
    try {
      if (isNew) await api('/payroll/components', { method: 'POST', body: v });
      else await api(`/payroll/components/${current!.id}`, { method: 'PATCH', body: { ...v, code: undefined } });
      message.success('Đã lưu khoản lương');
      qc.invalidateQueries({ queryKey: ['payroll-components'] });
      qc.invalidateQueries({ queryKey: ['payroll-variables'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };
  const insert = (name: string) => form.setFieldValue('formula', `${form.getFieldValue('formula') ?? ''}${name}`);
  const earlier = vars?.components.filter((c) => c.sortOrder < (sortOrder ?? Infinity) && c.name !== current?.code) ?? [];
  const tag = (v: { name: string; description: string }) => (
    <Tag key={v.name} style={{ cursor: 'pointer', marginBottom: 4 }} title={v.description} onClick={() => insert(v.name)}>{v.name}</Tag>
  );

  return (
    <Modal open={!!value} title={isNew ? 'Thêm khoản lương' : `Sửa khoản ${current?.code}`} width={980} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" destroyOnHidden>
      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Form
            key={current?.id ?? 'new'}
            form={form}
            layout="vertical"
            onFinish={submit}
            initialValues={current ?? { kind: 'EARNING', taxable: true, roundDigits: 0, sortOrder: 500, showOnPayslip: true, isActive: true }}
          >
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="code" label="Mã" rules={[{ required: true, message: 'Nhập mã' }]}>
                  <Input disabled={!isNew} placeholder="PC_MOI" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="name" label="Tên khoản" rules={[{ required: true, message: 'Nhập tên' }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="kind" label="Loại">
                  <Select options={Object.entries(COMPONENT_KINDS).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="sortOrder" label="Thứ tự tính">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="roundDigits" label="Làm tròn (số lẻ)">
                  <InputNumber min={0} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="taxable" label="Chịu thuế TNCN" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="formula" label="Công thức" rules={[{ required: true, message: 'Nhập công thức' }]} extra="Phép toán + − × ÷ ( ), so sánh (> < >= <= == !=), hàm min, max, round, if… Nhấn vào biến bên phải để chèn.">
                  <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} onChange={() => setTestResult(null)} />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Space wrap style={{ marginBottom: 12 }}>
                  <EmployeeSelect value={testEmp} onChange={setTestEmp} style={{ width: 300 }} placeholder="Tính thử cho nhân viên (tùy chọn)" />
                  <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={testMonth} onChange={(d) => d && setTestMonth(d)} />
                  <Button icon={<ExperimentOutlined />} onClick={test}>Kiểm tra</Button>
                </Space>
                {testResult && (
                  <Alert
                    type={testResult.valid ? 'success' : 'error'}
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={testResult.valid ? (testResult.result !== null ? `Hợp lệ — kết quả: ${formatNumber(testResult.result, 4)}` : 'Công thức hợp lệ') : testResult.error}
                  />
                )}
              </Col>
              <Col span={24}>
                <Form.Item name="description" label="Ghi chú / căn cứ">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="showOnPayslip" label="Hiện trên phiếu lương" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Col>
        <Col xs={24} lg={10} style={{ maxHeight: 560, overflow: 'auto' }}>
          <Typography.Text strong>Biến đầu vào</Typography.Text>
          <div>{vars?.inputs.map(tag)}</div>
          <Typography.Text strong>Phụ cấp (theo hồ sơ)</Typography.Text>
          <div>{vars?.allowances.map(tag)}</div>
          <Typography.Text strong>Khoản tính trước</Typography.Text>
          <div>{earlier.map(tag)}</div>
          <Typography.Text strong>Hàm</Typography.Text>
          <div>{vars?.functions.map((f) => <Tag key={f} style={{ marginBottom: 4 }}>{f}</Tag>)}</div>
        </Col>
      </Row>
    </Modal>
  );
}

// ================= THANG LƯƠNG =================

function ScalesTab() {
  const [editing, setEditing] = useState<Scale | 'new' | null>(null);
  const { data, isFetching } = useQuery({ queryKey: ['payroll-scales'], queryFn: () => api<Scale[]>('/payroll/scales') });
  const max = Math.max(0, ...(data ?? []).map((s) => s.steps.length));
  return (
    <Card>
      <div className="bm-filters">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>Thêm thang lương</Button>
        <Typography.Text type="secondary">Gắn thang cho chức danh nghề nghiệp tại Danh mục → Chức danh (trường “salaryScale”). Dữ liệu khởi tạo theo NĐ 204/2004 — Phòng TCCB đối chiếu.</Typography.Text>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 80, fixed: 'left' },
          { title: 'Tên', dataIndex: 'name', width: 260 },
          { title: 'Giữ bậc', dataIndex: 'raiseIntervalMonths', render: (m: number) => `${m} tháng` },
          ...Array.from({ length: max }, (_, i) => ({ title: `B${i + 1}`, key: `s${i}`, align: 'right' as const, render: (_: unknown, s: Scale) => formatNumber(s.steps[i]?.coefficient) })),
          { key: 'a', width: 50, render: (_, r) => <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} /> },
        ]}
      />
      <ScaleModal value={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function ScaleModal({ value, onClose }: { value: Scale | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const current = value && value !== 'new' ? value : null;
  const submit = async (v: { code: string; name: string; raiseIntervalMonths: number; coefficients: string; isActive: boolean }) => {
    const coefficients = v.coefficients.split(/[\s;,]+/).filter(Boolean).map((x) => x.replace(',', '.'));
    try {
      if (current) await api(`/payroll/scales/${current.id}`, { method: 'PATCH', body: { name: v.name, raiseIntervalMonths: v.raiseIntervalMonths, coefficients, isActive: v.isActive } });
      else await api('/payroll/scales', { method: 'POST', body: { ...v, coefficients } });
      message.success('Đã lưu thang lương');
      qc.invalidateQueries({ queryKey: ['payroll-scales'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={!!value} title={current ? `Sửa thang ${current.code}` : 'Thêm thang lương'} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" destroyOnHidden>
      <Form
        key={current?.id ?? 'new'}
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={current ? { ...current, coefficients: current.steps.map((s) => s.coefficient).join(' ') } : { raiseIntervalMonths: 36, isActive: true }}
      >
        <Form.Item name="code" label="Mã" rules={[{ required: true }]}>
          <Input disabled={!!current} />
        </Form.Item>
        <Form.Item name="name" label="Tên" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="raiseIntervalMonths" label="Thời gian giữ bậc (tháng)" rules={[{ required: true }]}>
          <InputNumber min={1} max={120} />
        </Form.Item>
        <Form.Item name="coefficients" label="Hệ số các bậc (cách nhau bởi dấu cách)" rules={[{ required: true }]} extra="Sửa hệ số không làm thay đổi diễn biến lương đã lưu của nhân viên.">
          <Input.TextArea rows={2} placeholder="2.34 2.67 3.00 3.33 …" />
        </Form.Item>
        <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ================= BIỂU THUẾ =================

function PitTab() {
  const [adding, setAdding] = useState(false);
  const { data, isFetching } = useQuery({ queryKey: ['pit-brackets'], queryFn: () => api<PitVersion[]>('/payroll/pit-brackets') });
  return (
    <Card>
      <div className="bm-filters">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Thêm phiên bản biểu thuế</Button>
        <Typography.Text type="secondary">Biểu thuế lũy tiến từng phần áp cho thu nhập tính thuế theo tháng; khi luật thay đổi chỉ cần thêm phiên bản có ngày hiệu lực mới. Mức giảm trừ gia cảnh ở Tham số chính sách.</Typography.Text>
      </div>
      <Row gutter={[16, 16]}>
        {isFetching && !data && <Col span={24}>Đang tải…</Col>}
        {data?.map((v) => (
          <Col xs={24} lg={12} key={v.id}>
            <Card size="small" title={`Hiệu lực từ ${formatDay(v.effectiveFrom)}`} extra={v.legalBasis}>
              <Table
                rowKey="i"
                size="small"
                pagination={false}
                dataSource={v.brackets.map((b, i) => ({ ...b, from: i ? v.brackets[i - 1].upTo : '0', i: i + 1 }))}
                columns={[
                  { title: 'Bậc', dataIndex: 'i', width: 50 },
                  { title: 'Thu nhập tính thuế / tháng', key: 'r', render: (_, b) => (b.upTo ? `Trên ${money(b.from)} đến ${money(b.upTo)}` : `Trên ${money(b.from)}`) },
                  { title: 'Thuế suất', dataIndex: 'rate', align: 'right', render: (r: string) => `${formatNumber(r)}%` },
                ]}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <PitModal open={adding} onClose={() => setAdding(false)} latest={data?.[0]} />
    </Card>
  );
}

function PitModal({ open, onClose, latest }: { open: boolean; onClose: () => void; latest?: PitVersion }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const submit = async (v: { effectiveFrom: Dayjs; legalBasis?: string; brackets: { upTo?: number | null; rate: number }[] }) => {
    const brackets = v.brackets.map((b, i) => ({ upTo: i === v.brackets.length - 1 ? null : String(b.upTo ?? ''), rate: String(b.rate) }));
    try {
      await api('/payroll/pit-brackets', { method: 'POST', body: { effectiveFrom: fromDayjs(v.effectiveFrom), legalBasis: v.legalBasis ?? '', brackets } });
      message.success('Đã thêm biểu thuế');
      qc.invalidateQueries({ queryKey: ['pit-brackets'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} title="Thêm phiên bản biểu thuế TNCN" width={560} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{ brackets: latest?.brackets.map((b) => ({ upTo: b.upTo ? Number(b.upTo) : null, rate: Number(b.rate) })) ?? [{ rate: 5 }] }}
      >
        <Space>
          <Form.Item name="effectiveFrom" label="Hiệu lực từ" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="legalBasis" label="Căn cứ pháp lý">
            <Input style={{ width: 280 }} />
          </Form.Item>
        </Space>
        <Form.List name="brackets">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f, i) => (
                <Space key={f.key} align="baseline">
                  <span style={{ width: 50, display: 'inline-block' }}>Bậc {i + 1}</span>
                  <Form.Item name={[f.name, 'upTo']} extra={i === fields.length - 1 ? 'Bậc cuối: không giới hạn' : undefined}>
                    <InputNumber placeholder="Đến (đồng)" disabled={i === fields.length - 1} style={{ width: 200 }} formatter={(v) => (v ? Number(v).toLocaleString('vi-VN') : '')} parser={(v) => Number((v ?? '').replace(/\D/g, ''))} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'rate']} rules={[{ required: true }]}>
                    <InputNumber min={0} max={100} addonAfter="%" style={{ width: 120 }} />
                  </Form.Item>
                  <Button type="text" danger onClick={() => remove(f.name)}>×</Button>
                </Space>
              ))}
              <Button onClick={() => add({ rate: 0 })} icon={<PlusOutlined />}>Thêm bậc</Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
