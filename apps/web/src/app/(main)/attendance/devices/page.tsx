'use client';

import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { createDeviceSchema, DEVICE_CLOCK_DRIFT_WARN_SECONDS } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { useCampuses } from '@/lib/queries';

interface Device {
  id: string;
  code: string;
  name: string;
  campusId: string;
  location: string | null;
  host: string;
  port: number;
  useHttps: boolean;
  username: string;
  eventMinors: string;
  model: string | null;
  serialNumber: string | null;
  firmware: string | null;
  isActive: boolean;
  lastEventTime: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  lastFetchedCount: number | null;
  clockOffsetSeconds: number | null;
  health: 'ONLINE' | 'OFFLINE' | 'NEVER' | 'DISABLED';
  clockDrift: boolean;
  campus: { name: string };
}

const HEALTH = {
  ONLINE: { color: 'green', label: 'Đang kết nối' },
  OFFLINE: { color: 'red', label: 'Mất kết nối' },
  NEVER: { color: 'orange', label: 'Chưa đồng bộ được' },
  DISABLED: { color: 'default', label: 'Ngừng dùng' },
} as const;

export default function DevicesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Device | 'new' | null>(null);
  const { data, isFetching } = useQuery({ queryKey: ['devices'], queryFn: () => api<Device[]>('/attendance/devices'), refetchInterval: 30_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['devices'] });

  const test = async (d: Device) => {
    const hide = message.loading(`Đang kết nối ${d.name}…`, 0);
    try {
      const r = await api<{ ok: boolean; model?: string; serialNumber?: string; firmware?: string; clockOffsetSeconds?: number | null; error?: string }>(`/attendance/devices/${d.id}/test`, { method: 'POST' });
      hide();
      if (r.ok) {
        modal.success({
          title: 'Kết nối thành công',
          content: (
            <>
              <div>Model: <b>{r.model}</b></div>
              <div>Số serial: {r.serialNumber}</div>
              <div>Firmware: {r.firmware}</div>
              <div>
                Lệch giờ so với máy chủ: {r.clockOffsetSeconds ?? '—'} giây
                {r.clockOffsetSeconds !== null && r.clockOffsetSeconds !== undefined && Math.abs(r.clockOffsetSeconds) > DEVICE_CLOCK_DRIFT_WARN_SECONDS && (
                  <Tag color="red" style={{ marginLeft: 8 }}>Cần chỉnh giờ máy</Tag>
                )}
              </div>
            </>
          ),
        });
      } else modal.error({ title: 'Không kết nối được', content: r.error });
      refresh();
    } catch (e) {
      hide();
      message.error(errorMessage(e));
    }
  };

  const sync = async (d: Device) => {
    try {
      await api(`/attendance/devices/${d.id}/sync`, { method: 'POST' });
      message.success(`Đã gửi lệnh đồng bộ ${d.name}`);
      setTimeout(refresh, 4000);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const remove = (d: Device) =>
    modal.confirm({
      title: `Xóa máy ${d.name}?`,
      content: 'Dữ liệu chấm công đã lấy về vẫn được giữ nguyên.',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api(`/attendance/devices/${d.id}`, { method: 'DELETE' });
        refresh();
      },
    });

  const offline = data?.filter((d) => d.health === 'OFFLINE' || d.health === 'NEVER') ?? [];

  const columns: ColumnsType<Device> = [
    {
      title: 'Máy',
      key: 'name',
      render: (_, d) => (
        <>
          <Typography.Text strong>{d.name}</Typography.Text> <Tag>{d.code}</Tag>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {d.campus.name}
            {d.location ? ` · ${d.location}` : ''}
          </Typography.Text>
        </>
      ),
    },
    { title: 'Địa chỉ', key: 'host', render: (_, d) => `${d.useHttps ? 'https' : 'http'}://${d.host}:${d.port}`, responsive: ['lg'] },
    { title: 'Model', dataIndex: 'model', render: (v) => v ?? '—', responsive: ['xl'] },
    {
      title: 'Tình trạng',
      key: 'health',
      render: (_, d) => (
        <Space direction="vertical" size={2}>
          <Tag color={HEALTH[d.health].color}>{HEALTH[d.health].label}</Tag>
          {d.clockDrift && <Tag color="red">Lệch giờ {d.clockOffsetSeconds}s</Tag>}
          {d.lastError && d.lastSyncStatus === 'ERROR' && (
            <Tooltip title={d.lastError}>
              <Typography.Text type="danger" style={{ fontSize: 12 }} ellipsis>
                {d.lastError.slice(0, 40)}
              </Typography.Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Đồng bộ gần nhất',
      key: 'sync',
      render: (_, d) => (
        <>
          {formatDateTime(d.lastSuccessAt)}
          {d.lastFetchedCount !== null && (
            <div style={{ fontSize: 12, color: 'var(--bm-text-secondary)' }}>{d.lastFetchedCount} sự kiện lần gần nhất</div>
          )}
        </>
      ),
    },
    { title: 'Lượt quét mới nhất', dataIndex: 'lastEventTime', render: formatDateTime, responsive: ['xl'] },
    {
      title: '',
      key: 'a',
      width: 170,
      align: 'right',
      render: (_, d) => (
        <Space size={0}>
          <Tooltip title="Kiểm tra kết nối"><Button type="text" icon={<ApiOutlined />} onClick={() => test(d)} /></Tooltip>
          <Tooltip title="Đồng bộ ngay"><Button type="text" icon={<SyncOutlined />} onClick={() => sync(d)} disabled={!d.isActive} /></Tooltip>
          <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(d)} aria-label="Sửa" />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(d)} aria-label="Xóa" />
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Máy chấm công Face ID"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Thêm máy
          </Button>
        }
      />
      {offline.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${offline.length} máy không đồng bộ được: ${offline.map((d) => d.name).join(', ')}`}
          description="Hệ thống tự lấy bù dữ liệu khi máy kết nối lại (tối đa 31 ngày). Kiểm tra nguồn điện, mạng và tài khoản máy."
        />
      )}
      <Card>
        <Typography.Paragraph type="secondary">
          Hệ thống tự lấy dữ liệu từ mọi máy mỗi 5 phút qua giao thức Hikvision ISAPI. Máy coi là mất kết nối nếu quá 15 phút không đồng bộ được.
        </Typography.Paragraph>
        <Table rowKey="id" columns={columns} dataSource={data} loading={isFetching && !data} pagination={false} scroll={{ x: 'max-content' }} />
      </Card>
      <DeviceModal device={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

function DeviceModal({ device, open, onClose, onSaved }: { device: Device | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { data: campuses } = useCampuses();
  const [saving, setSaving] = useState(false);
  const isNew = !device;

  const submit = async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...v, location: v.location ?? '', password: v.password || undefined };
      if (isNew) await api('/attendance/devices', { method: 'POST', body });
      else {
        const { code: _c, ...rest } = body;
        await api(`/attendance/devices/${device.id}`, { method: 'PATCH', body: rest });
      }
      message.success('Đã lưu máy chấm công');
      onSaved();
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const initial = device
    ? { ...device, location: device.location ?? undefined, password: undefined }
    : { port: 80, useHttps: false, username: 'admin', eventMinors: '75', isActive: true };

  return (
    <Modal open={open} title={isNew ? 'Thêm máy chấm công' : `Sửa: ${device.name}`} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} key={device?.id ?? 'new'}>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="code" label="Mã máy" rules={[{ required: true, message: 'Nhập mã' }, zodRule(createDeviceSchema.shape.code)]}>
              <Input disabled={!isNew} placeholder="vd: HN-A9-01" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="name" label="Tên máy" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input placeholder="vd: Cửa chính nhà A9" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="campusId" label="Cơ sở" rules={[{ required: true, message: 'Chọn cơ sở' }]}>
              <Select options={campuses?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="location" label="Vị trí đặt máy">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={16} sm={10}>
            <Form.Item name="host" label="Địa chỉ IP" rules={[{ required: true, message: 'Nhập IP' }]}>
              <Input placeholder="192.168.1.100" />
            </Form.Item>
          </Col>
          <Col xs={8} sm={6}>
            <Form.Item name="port" label="Cổng">
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="useHttps" label="HTTPS" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="username" label="Tài khoản máy" rules={[{ required: true, message: 'Nhập tài khoản' }]}>
              <Input autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="password"
              label="Mật khẩu máy"
              extra={isNew ? 'Được mã hóa khi lưu' : 'Bỏ trống để giữ mật khẩu cũ'}
              rules={isNew ? [{ required: true, message: 'Nhập mật khẩu' }] : []}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="eventMinors" label="Mã sự kiện chấm công (minor)" extra="75 = xác thực khuôn mặt thành công. Nhiều mã cách nhau dấu phẩy.">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
