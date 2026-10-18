'use client';

import { DeleteOutlined, DownloadOutlined, PlusOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Select, Spin, Table, Tag, TreeSelect, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { EmployeeSelect } from '@/components/EmployeeSelect';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile, uploadFile } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { EXTRA_STATUS, money, monthLabel, type ExtraIncomeStatus } from '@/lib/payroll';
import { buildUnitTree, useUnits } from '@/lib/queries';

interface ProposalRow {
  id: string;
  code: string;
  unitId: string;
  unitName: string;
  month: string;
  title: string;
  note: string | null;
  status: ExtraIncomeStatus;
  total: string;
  lineCount: number;
  approvalRequestId: string | null;
  createdAt: string;
}
interface ProposalDetail extends Omit<ProposalRow, 'lineCount'> {
  lines: { id: string; amount: string; note: string | null; employee: { id: string; code: string; fullName: string } }[];
}
interface Line { key: string; employeeId?: string; label?: string; amount?: number; note?: string }

export default function ExtraIncomePage() {
  const can = useCan();
  const { data: units } = useUnits();
  const [filters, setFilters] = useState<{ month?: string; unitId?: string; status?: string }>({});
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['extra-income', filters, page],
    queryFn: () => api<Paginated<ProposalRow>>('/payroll/extra-income', { query: { ...filters, ...page } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Thu nhập tăng thêm"
        extra={can('payroll.extra_income.propose') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Lập đề xuất</Button>}
      />
      <Card>
        <div className="bm-filters">
          <DatePicker picker="month" format="MM/YYYY" placeholder="Tháng chi" onChange={(d) => setFilters((f) => ({ ...f, month: d ? d.format('YYYY-MM') : undefined }))} />
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Đơn vị" style={{ width: 260 }} treeData={units ? buildUnitTree(units) : []} onChange={(v) => setFilters((f) => ({ ...f, unitId: v }))} />
          <Select allowClear placeholder="Trạng thái" style={{ width: 150 }} options={Object.entries(EXTRA_STATUS).map(([value, s]) => ({ value, label: s.label }))} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} />
        </div>
        <Table
          rowKey="id"
          loading={isFetching}
          dataSource={data?.items}
          scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
          pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
          columns={[
            { title: 'Số đề xuất', dataIndex: 'code', width: 140 },
            { title: 'Tháng chi', dataIndex: 'month', render: monthLabel, width: 90 },
            { title: 'Đơn vị', dataIndex: 'unitName' },
            { title: 'Nội dung', dataIndex: 'title' },
            { title: 'Số người', dataIndex: 'lineCount', align: 'right' },
            { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: money },
            { title: 'Trạng thái', dataIndex: 'status', render: (s: ExtraIncomeStatus) => <Tag color={EXTRA_STATUS[s].color}>{EXTRA_STATUS[s].label}</Tag> },
            { title: 'Ngày lập', dataIndex: 'createdAt', render: formatDateTime, responsive: ['xl'] },
          ]}
        />
      </Card>
      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={setOpenId} />
      <ProposalDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

let seq = 0;
const newLine = (): Line => ({ key: `l${++seq}` });

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: units } = useUnits();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const unitId = Form.useWatch('unitId', form) as string | undefined;
  const total = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const importExcel = async (file: File) => {
    if (!unitId) {
      message.warning('Chọn đơn vị trước');
      return false;
    }
    try {
      const r = await uploadFile<{ lines: { employeeId: string; code: string; fullName: string; amount: string; note: string | null }[]; errors: { row: number; message: string }[] }>(
        '/payroll/extra-income/parse',
        file,
        { unitId },
      );
      setLines(r.lines.map((l) => ({ key: `l${++seq}`, employeeId: l.employeeId, label: `${l.code} — ${l.fullName}`, amount: Number(l.amount), note: l.note ?? undefined })));
      setImportErrors(r.errors);
      message.success(`Đã đọc ${r.lines.length} dòng`);
    } catch (e) {
      message.error(errorMessage(e));
    }
    return false;
  };

  const submit = async (v: { unitId: string; month: Dayjs; title: string; note?: string }) => {
    const valid = lines.filter((l) => l.employeeId && l.amount);
    if (!valid.length) return message.error('Thêm ít nhất một nhân viên có số tiền');
    setSaving(true);
    try {
      const r = await api<{ id: string; code: string }>('/payroll/extra-income', {
        method: 'POST',
        body: { unitId: v.unitId, month: v.month.format('YYYY-MM'), title: v.title, note: v.note ?? '', lines: valid.map((l) => ({ employeeId: l.employeeId, amount: String(l.amount), note: l.note ?? '' })) },
      });
      message.success(`Đã gửi đề xuất ${r.code} tới Phòng TCKT`);
      qc.invalidateQueries({ queryKey: ['extra-income'] });
      form.resetFields();
      setLines([newLine()]);
      setImportErrors([]);
      onClose();
      onCreated(r.id);
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Đề xuất thanh toán thu nhập tăng thêm" width={860} onCancel={onClose} onOk={() => form.submit()} okText="Gửi duyệt" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ month: dayjs() }}>
        <Row gutter={16}>
          <Col xs={24} sm={10}>
            <Form.Item name="unitId" label="Đơn vị đề xuất" rules={[{ required: true, message: 'Chọn đơn vị' }]}>
              <TreeSelect showSearch treeNodeFilterProp="title" treeData={units ? buildUnitTree(units) : []} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={5}>
            <Form.Item name="month" label="Chi vào tháng" rules={[{ required: true }]}>
              <DatePicker picker="month" format="MM/YYYY" allowClear={false} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={9}>
            <Form.Item name="title" label="Nội dung" rules={[{ required: true, message: 'Nhập nội dung' }]}>
              <Input placeholder="VD: Thu nhập tăng thêm quý III/2026" />
            </Form.Item>
          </Col>
        </Row>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Button icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>Thêm dòng</Button>
          <Upload accept=".xlsx" showUploadList={false} beforeUpload={importExcel}>
            <Button icon={<UploadOutlined />}>Nhập từ Excel</Button>
          </Upload>
          <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadFile('/payroll/extra-income/template')}>File mẫu</Button>
          <Typography.Text strong style={{ marginLeft: 'auto', alignSelf: 'center' }}>Tổng: {money(total)} đ · {lines.filter((l) => l.employeeId).length} người</Typography.Text>
        </div>
        {importErrors.length > 0 && (
          <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={`${importErrors.length} dòng bị bỏ qua`} description={importErrors.slice(0, 8).map((e) => <div key={e.row}>Dòng {e.row}: {e.message}</div>)} />
        )}
        <Table
          rowKey="key"
          size="small"
          pagination={lines.length > 20 ? { pageSize: 20 } : false}
          dataSource={lines}
          columns={[
            {
              title: 'Nhân viên',
              key: 'e',
              render: (_, l) =>
                l.label ? l.label : <EmployeeSelect unitId={unitId} value={l.employeeId} style={{ width: 340 }} onPick={(e) => patch(l.key, { employeeId: e?.id, label: e ? `${e.code} — ${e.fullName}` : undefined })} />,
            },
            {
              title: 'Số tiền',
              key: 'a',
              width: 170,
              render: (_, l) => (
                <InputNumber
                  min={0}
                  step={100000}
                  value={l.amount}
                  style={{ width: '100%' }}
                  formatter={(v) => (v ? Number(v).toLocaleString('vi-VN') : '')}
                  parser={(v) => Number((v ?? '').replace(/\D/g, ''))}
                  onChange={(v) => patch(l.key, { amount: v ?? undefined })}
                />
              ),
            },
            { title: 'Ghi chú', key: 'n', render: (_, l) => <Input value={l.note} onChange={(e) => patch(l.key, { note: e.target.value })} /> },
            { key: 'x', width: 40, render: (_, l) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /> },
          ]}
        />
        <Form.Item name="note" label="Ghi chú" style={{ marginTop: 12 }}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ProposalDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const can = useCan();
  const { data: p, isLoading } = useQuery({ queryKey: ['extra-income-detail', id], queryFn: () => api<ProposalDetail>(`/payroll/extra-income/${id}`), enabled: !!id });
  const cancel = () =>
    modal.confirm({
      title: `Hủy đề xuất ${p?.code}?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/payroll/extra-income/${id}/cancel`, { method: 'POST' });
          qc.invalidateQueries({ queryKey: ['extra-income'] });
          qc.invalidateQueries({ queryKey: ['extra-income-detail', id] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  const canCancel = p && (p.status === 'PENDING' || (p.status === 'APPROVED' && can('payroll.extra_income.approve')));
  return (
    <Drawer open={!!id} onClose={onClose} width={640} title={p ? `Đề xuất ${p.code}` : 'Đề xuất'} destroyOnHidden extra={canCancel && <Button danger icon={<StopOutlined />} onClick={cancel}>Hủy</Button>}>
      {isLoading || !p ? <Spin /> : (
        <>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Đơn vị">{p.unitName}</Descriptions.Item>
            <Descriptions.Item label="Tháng chi">{monthLabel(p.month)}</Descriptions.Item>
            <Descriptions.Item label="Nội dung">{p.title}</Descriptions.Item>
            {p.note && <Descriptions.Item label="Ghi chú">{p.note}</Descriptions.Item>}
            <Descriptions.Item label="Tổng tiền"><b>{money(p.total)} đ</b> · {p.lines.length} người</Descriptions.Item>
            <Descriptions.Item label="Trạng thái"><Tag color={EXTRA_STATUS[p.status].color}>{EXTRA_STATUS[p.status].label}</Tag></Descriptions.Item>
          </Descriptions>
          {p.approvalRequestId && p.status === 'PENDING' && (
            <Typography.Paragraph style={{ marginTop: 8 }} type="secondary">
              Phòng TCKT duyệt tại <a href={`/approvals?open=${p.approvalRequestId}`}>Việc cần duyệt</a>.
            </Typography.Paragraph>
          )}
          <Table
            style={{ marginTop: 12 }}
            rowKey="id"
            size="small"
            pagination={p.lines.length > 50 ? { pageSize: 50 } : false}
            dataSource={p.lines}
            columns={[
              { title: 'Mã NV', key: 'c', render: (_, l) => l.employee.code, width: 100 },
              { title: 'Họ tên', key: 'n', render: (_, l) => l.employee.fullName },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: money },
              { title: 'Ghi chú', dataIndex: 'note' },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}
