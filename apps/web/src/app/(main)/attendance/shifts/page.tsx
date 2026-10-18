'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, TimePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { createShiftSchema, isOvernight, SHIFT_TYPES, type ShiftType } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useShifts, type Shift } from '@/lib/attendance';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { formatDay, formatNumber } from '@/lib/format';
import { useCampuses } from '@/lib/queries';
import type { ApiRecord } from '@/lib/types';

export default function ShiftsPage() {
  const can = useCan();
  return (
    <>
      <PageHeader title="Ca làm việc, ngày lễ, tiền trực" />
      <Tabs
        destroyOnHidden
        items={[
          { key: 'shifts', label: 'Ca làm việc & ca trực', children: <ShiftList canEdit={can('attendance.shift.manage')} /> },
          { key: 'holidays', label: 'Ngày lễ', children: <Holidays canEdit={can('attendance.shift.manage')} /> },
          ...(can(['duty.pay.read', 'attendance.shift.manage', 'payroll.config.manage'])
            ? [{ key: 'duty', label: 'Mức tiền trực', children: <DutyRates canEdit={can(['attendance.shift.manage', 'payroll.config.manage'])} /> }]
            : []),
        ]}
      />
    </>
  );
}

// ======================= CA =======================

function ShiftList({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useShifts(true);
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const columns: ColumnsType<Shift> = [
    {
      title: 'Ca',
      key: 'name',
      render: (_, s) => (
        <Space>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color ?? '#999' }} />
          <Typography.Text strong>{s.code}</Typography.Text> {s.name}
          {!s.isActive && <Tag>Ngừng dùng</Tag>}
        </Space>
      ),
    },
    { title: 'Loại', dataIndex: 'type', render: (t: ShiftType) => <Tag color={t === 'DUTY' ? 'red' : 'green'}>{SHIFT_TYPES[t]}</Tag> },
    {
      title: 'Giờ',
      key: 't',
      render: (_, s) => (
        <>
          {s.startTime} – {s.endTime}
          {isOvernight(s.startTime, s.endTime) && <Tag style={{ marginLeft: 6 }}>qua đêm</Tag>}
        </>
      ),
    },
    { title: 'Nghỉ giữa ca', dataIndex: 'breakMinutes', render: (v) => (v ? `${v} phút` : '—'), responsive: ['lg'] },
    { title: 'Cho phép muộn / sớm', key: 'g', render: (_, s) => `${s.lateGraceMinutes} / ${s.earlyGraceMinutes} phút`, responsive: ['md'] },
    { title: 'Số công', dataIndex: 'workUnits', render: (v) => formatNumber(v) },
    ...(canEdit ? [{ title: '', key: 'a', width: 50, render: (_: unknown, s: Shift) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(s)} aria-label="Sửa" /> }] : []),
  ];
  return (
    <Card
      extra={
        canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Thêm ca
          </Button>
        )
      }
      title="Danh mục ca"
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="Danh sách ca hiện là dữ liệu mẫu"
        description="Phòng TCCB cập nhật theo các ca thực tế của bệnh viện: giờ vào/ra, số phút cho phép đi muộn/về sớm, số công quy đổi. Giờ ra ≤ giờ vào nghĩa là ca qua đêm."
      />
      <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} scroll={{ x: 'max-content' }} />
      <ShiftModal shift={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </Card>
  );
}

function ShiftModal({ shift, open, onClose }: { shift: Shift | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: campuses } = useCampuses();
  const [saving, setSaving] = useState(false);
  const isNew = !shift;

  const submit = async (v: ApiRecord) => {
    setSaving(true);
    const body: Record<string, unknown> = { ...v, startTime: (v.startTime as Dayjs).format('HH:mm'), endTime: (v.endTime as Dayjs).format('HH:mm'), campusId: v.campusId ?? null, color: v.color ?? '' };
    try {
      if (isNew) await api('/attendance/shifts', { method: 'POST', body });
      else {
        const { code: _c, ...rest } = body;
        await api(`/attendance/shifts/${shift.id}`, { method: 'PATCH', body: rest });
      }
      message.success('Đã lưu ca. Bảng công các tháng chưa chốt sẽ dùng cấu hình mới khi tính lại.');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const t = (hhmm: string) => dayjs(`2000-01-01T${hhmm}`);
  const initial = shift
    ? { ...shift, startTime: t(shift.startTime), endTime: t(shift.endTime), color: shift.color ?? undefined }
    : { type: 'WORK', startTime: t('07:30'), endTime: t('16:30'), breakMinutes: 60, lateGraceMinutes: 5, earlyGraceMinutes: 5, checkInBeforeMinutes: 120, checkOutAfterMinutes: 240, workUnits: '1', isActive: true, sortOrder: 0 };

  return (
    <Modal open={open} title={isNew ? 'Thêm ca' : `Sửa ca ${shift.code}`} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" width={720} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} key={shift?.id ?? 'new'}>
        <Row gutter={16}>
          <Col xs={24} sm={6}>
            <Form.Item name="code" label="Mã ca" rules={[{ required: true, message: 'Nhập mã' }, zodRule(createShiftSchema.shape.code)]}>
              <Input disabled={!isNew} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Tên ca" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
              <Select options={Object.entries(SHIFT_TYPES).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="startTime" label="Giờ vào" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="endTime" label="Giờ ra" rules={[{ required: true }]} extra="≤ giờ vào = qua đêm">
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="breakMinutes" label="Nghỉ giữa ca (phút)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="workUnits" label="Số công quy đổi">
              <InputNumber<string> stringMode min="0" step="0.5" decimalSeparator="," style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="lateGraceMinutes" label="Cho phép muộn (phút)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="earlyGraceMinutes" label="Cho phép về sớm (phút)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="checkInBeforeMinutes" label="Nhận quét vào trước (phút)" extra="Lượt quét sớm hơn không tính cho ca">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="checkOutAfterMinutes" label="Nhận quét ra sau (phút)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="campusId" label="Áp dụng tại cơ sở">
              <Select allowClear placeholder="Cả hai cơ sở" options={campuses?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="color" label="Màu hiển thị">
              <Input type="color" style={{ height: 32, padding: 2 }} />
            </Form.Item>
          </Col>
          <Col xs={6} sm={5}>
            <Form.Item name="sortOrder" label="Thứ tự">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={6} sm={5}>
            <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ======================= NGÀY LỄ =======================

function Holidays({ canEdit }: { canEdit: boolean }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(dayjs().year());
  const [form] = Form.useForm();
  const { data, isLoading } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => api<{ id: string; date: string; name: string }[]>('/attendance/holidays', { query: { year } }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['holidays'] });

  const add = async (v: { date: Dayjs; name: string }) => {
    try {
      await api('/attendance/holidays', { method: 'POST', body: { date: v.date.format('YYYY-MM-DD'), name: v.name } });
      message.success('Đã thêm ngày lễ — bảng công ngày đó đang được tính lại');
      form.resetFields();
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Card title="Ngày nghỉ lễ, Tết" extra={<InputNumber value={year} onChange={(v) => v && setYear(v)} min={2020} max={2100} />}>
      <Typography.Paragraph type="secondary">
        Danh sách khởi tạo chỉ có các ngày lễ dương lịch cố định. Hằng năm cần bổ sung Tết Nguyên đán, Giỗ Tổ Hùng Vương và ngày nghỉ bù theo thông báo của Chính phủ.
      </Typography.Paragraph>
      {canEdit && (
        <Form form={form} layout="inline" onFinish={add} style={{ marginBottom: 16, rowGap: 8 }}>
          <Form.Item name="date" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="vd: Tết Nguyên đán" style={{ width: 240 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
            Thêm
          </Button>
        </Form>
      )}
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Ngày', dataIndex: 'date', render: (v: string) => `${formatDay(v)} (${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayjs(v.slice(0, 10)).day()]})` },
          { title: 'Tên', dataIndex: 'name' },
          ...(canEdit
            ? [
                {
                  title: '',
                  key: 'a',
                  width: 50,
                  render: (_: unknown, h: { id: string; name: string }) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => modal.confirm({ title: `Xóa ngày lễ "${h.name}"?`, okButtonProps: { danger: true }, onOk: async () => { await api(`/attendance/holidays/${h.id}`, { method: 'DELETE' }); refresh(); } })}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}

// ======================= TIỀN TRỰC =======================

interface DutyRateRow {
  shift: { id: string; code: string; name: string; isActive: boolean };
  current: { value: string; effectiveFrom: string } | null;
  versions: { id: string; effectiveFrom: string; value: string; legalBasis: string | null; note: string | null }[];
}

function DutyRates({ canEdit }: { canEdit: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<DutyRateRow | null>(null);
  const [form] = Form.useForm();
  const { data, isLoading } = useQuery({ queryKey: ['duty-rates'], queryFn: () => api<DutyRateRow[]>('/attendance/duty-rates') });

  const submit = async (v: { effectiveFrom: Dayjs; amount: string; legalBasis?: string; note?: string }) => {
    if (!adding) return;
    try {
      await api(`/attendance/shifts/${adding.shift.id}/duty-rates`, {
        method: 'POST',
        body: { effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'), amount: v.amount, legalBasis: v.legalBasis ?? '', note: v.note ?? '' },
      });
      message.success('Đã thêm mức tiền trực');
      setAdding(null);
      queryClient.invalidateQueries({ queryKey: ['duty-rates'] });
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };

  return (
    <Card title="Mức tiền trực theo ca trực (có ngày hiệu lực)">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Tiền trực = mức có hiệu lực tại ngày trực × (số công thực tế / số công của ca)"
        description="Mức tiền trực theo quy định hiện hành do Phòng TCKT khai báo. Thay đổi chính sách → thêm mức mới với ngày hiệu lực, không sửa mức cũ."
      />
      <Table
        rowKey={(r) => r.shift.id}
        loading={isLoading}
        dataSource={data}
        pagination={false}
        expandable={{
          expandedRowRender: (r) => (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={r.versions}
              columns={[
                { title: 'Hiệu lực từ', dataIndex: 'effectiveFrom', render: formatDay },
                { title: 'Mức (đồng / ca)', dataIndex: 'value', render: (v) => formatNumber(v, 0) },
                { title: 'Căn cứ', dataIndex: 'legalBasis', render: (v) => v ?? '—' },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Ca trực', key: 's', render: (_, r) => <><b>{r.shift.code}</b> {r.shift.name}</> },
          { title: 'Mức hiện hành', key: 'c', render: (_, r) => (r.current ? <b>{formatNumber(r.current.value, 0)} đ</b> : <Tag color="red">Chưa khai báo</Tag>) },
          { title: 'Từ ngày', key: 'f', render: (_, r) => formatDay(r.current?.effectiveFrom) },
          ...(canEdit ? [{ title: '', key: 'a', width: 140, render: (_: unknown, r: DutyRateRow) => <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(r)}>Mức mới</Button> }] : []),
        ]}
      />
      <Modal open={!!adding} title={`Mức tiền trực mới: ${adding?.shift.name ?? ''}`} onCancel={() => setAdding(null)} onOk={() => form.submit()} okText="Lưu" destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={submit} key={adding?.shift.id}>
          <Form.Item name="effectiveFrom" label="Hiệu lực từ ngày" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="amount" label="Mức tiền (đồng / ca trực)" rules={[{ required: true }]}>
            <InputNumber<string> stringMode min="0" style={{ width: 220 }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => (v ?? '').replace(/\./g, '')} />
          </Form.Item>
          <Form.Item name="legalBasis" label="Căn cứ văn bản" rules={[{ required: true, message: 'Nhập căn cứ' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
