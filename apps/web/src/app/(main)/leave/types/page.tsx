'use client';

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import { createLeaveTypeSchema } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useLeaveTypes, type LeaveType } from '@/lib/attendance';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';

const yes = (v: boolean) => (v ? <Tag color="green">Có</Tag> : <Tag>Không</Tag>);

export default function LeaveTypesPage() {
  const { data, isLoading } = useLeaveTypes(true);
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Loại phiếu nghỉ, công tác" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>Thêm loại</Button>} />
      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Ký hiệu', dataIndex: 'symbol', render: (v) => <Tag color="blue">{v}</Tag> },
            { title: 'Tên', dataIndex: 'name', render: (v, t) => <>{v} {!t.isActive && <Tag>Ngừng dùng</Tag>}</> },
            { title: 'Hưởng lương', dataIndex: 'paid', render: yes },
            { title: 'Tính công', dataIndex: 'countsAsWork', render: yes },
            { title: 'Trừ phép năm', dataIndex: 'deductAnnualLeave', render: yes },
            { title: 'Bắt buộc giấy tờ', dataIndex: 'requiresAttachment', render: yes },
            { title: 'Quy trình duyệt', dataIndex: 'workflowCode' },
            { title: '', key: 'a', width: 50, render: (_, t) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(t)} aria-label="Sửa" /> },
          ]}
        />
      </Card>
      <TypeModal type={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function TypeModal({ type, open, onClose }: { type: LeaveType | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: workflows } = useQuery({
    queryKey: ['approval-workflows', 'LEAVE_REQUEST'],
    queryFn: () => api<{ code: string; name: string }[]>('/approval-workflows', { query: { targetType: 'LEAVE_REQUEST' } }),
  });
  const isNew = !type;
  const submit = async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...v, maxDaysPerRequest: v.maxDaysPerRequest ?? null };
      if (isNew) await api('/leave/types', { method: 'POST', body });
      else {
        const { code: _c, ...rest } = body;
        await api(`/leave/types/${type.id}`, { method: 'PATCH', body: rest });
      }
      message.success('Đã lưu loại phiếu');
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title={isNew ? 'Thêm loại phiếu' : `Sửa: ${type.name}`} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={saving} width={640} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        key={type?.id ?? 'new'}
        initialValues={type ?? { paid: true, countsAsWork: false, deductAnnualLeave: false, requiresAttachment: false, workflowCode: 'LEAVE_DEFAULT', isActive: true, sortOrder: 0 }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={6}>
            <Form.Item name="code" label="Mã" rules={[{ required: true }, zodRule(createLeaveTypeSchema.shape.code)]}>
              <Input disabled={!isNew} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Tên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name="symbol" label="Ký hiệu bảng công" rules={[{ required: true }]}>
              <Input maxLength={10} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}><Form.Item name="paid" label="Hưởng lương" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="countsAsWork" label="Tính công" valuePropName="checked" tooltip="Công tác, học tập vẫn được tính công"><Switch /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="deductAnnualLeave" label="Trừ phép năm" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="requiresAttachment" label="Bắt buộc giấy tờ" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={24} sm={12}>
            <Form.Item name="workflowCode" label="Quy trình duyệt" rules={[{ required: true }]}>
              <Select options={workflows?.map((w) => ({ value: w.code, label: w.name }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="maxDaysPerRequest" label="Tối đa ngày / phiếu">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={6} sm={3}><Form.Item name="sortOrder" label="Thứ tự"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={6} sm={3}><Form.Item name="isActive" label="Dùng" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
  );
}
