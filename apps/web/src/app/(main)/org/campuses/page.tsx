'use client';

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, InputNumber, Modal, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { createCampusSchema } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { useCampuses, type Campus } from '@/lib/queries';

export default function CampusesPage() {
  const can = useCan();
  const canManage = can('org.campus.manage');
  const { data, isLoading } = useCampuses();
  const [editing, setEditing] = useState<Campus | 'new' | null>(null);

  const columns: ColumnsType<Campus> = [
    { title: 'Mã', dataIndex: 'code', width: 90 },
    { title: 'Tên cơ sở', dataIndex: 'name' },
    { title: 'Địa chỉ', dataIndex: 'address', render: (v) => v ?? '—', responsive: ['md'] },
    { title: 'Điện thoại', dataIndex: 'phone', render: (v) => v ?? '—', responsive: ['lg'] },
    { title: 'Trạng thái', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">Hoạt động</Tag> : <Tag>Ngừng</Tag>) },
    ...(canManage
      ? [{ title: '', key: 'a', width: 50, render: (_: unknown, c: Campus) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(c)} aria-label="Sửa" /> }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Cơ sở"
        extra={
          canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Thêm cơ sở
            </Button>
          )
        }
      />
      <Card>
        <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} scroll={{ x: 'max-content' }} />
      </Card>
      <CampusModal campus={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function CampusModal({ campus, open, onClose }: { campus: Campus | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const isNew = !campus;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (campus) form.setFieldsValue({ ...campus, address: campus.address ?? '', phone: campus.phone ?? '' });
  }, [open, campus, form]);

  const submit = async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (isNew) await api('/org/campuses', { method: 'POST', body: v });
      else {
        const { code: _code, ...rest } = v;
        await api(`/org/campuses/${campus.id}`, { method: 'PATCH', body: rest });
      }
      message.success('Đã lưu cơ sở');
      queryClient.invalidateQueries({ queryKey: ['campuses'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={isNew ? 'Thêm cơ sở' : 'Sửa cơ sở'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ sortOrder: 0, isActive: true }}>
        <Form.Item name="code" label="Mã" rules={[{ required: true, message: 'Nhập mã' }, zodRule(createCampusSchema.shape.code)]}>
          <Input disabled={!isNew} />
        </Form.Item>
        <Form.Item name="name" label="Tên cơ sở" rules={[{ required: true, message: 'Nhập tên cơ sở' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ">
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="Điện thoại">
          <Input />
        </Form.Item>
        <Form.Item name="sortOrder" label="Thứ tự hiển thị">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="isActive" label="Đang hoạt động" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
