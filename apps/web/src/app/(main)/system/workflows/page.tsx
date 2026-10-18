'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Drawer, Form, Input, Row, Select, Space, Steps, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { APPROVAL_TARGET_TYPES, APPROVER_TYPES, upsertWorkflowSchema, type ApproverType } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { useRoles } from '@/lib/queries';

interface Step {
  stepOrder: number;
  name: string;
  approverType: ApproverType;
  roleId: string | null;
}
interface Workflow {
  id: string;
  code: string;
  name: string;
  targetType: keyof typeof APPROVAL_TARGET_TYPES;
  description: string | null;
  isActive: boolean;
  steps: Step[];
  _count: { requests: number };
}

export default function WorkflowsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['approval-workflows'], queryFn: () => api<Workflow[]>('/approval-workflows') });
  const { data: roles } = useRoles();
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null);
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name ?? '';

  const columns: ColumnsType<Workflow> = [
    {
      title: 'Quy trình',
      key: 'name',
      render: (_, w) => (
        <>
          <Typography.Text strong>{w.name}</Typography.Text> {!w.isActive && <Tag>Ngừng dùng</Tag>}
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {w.code} · {APPROVAL_TARGET_TYPES[w.targetType] ?? w.targetType}
          </Typography.Text>
        </>
      ),
    },
    {
      title: 'Các bước',
      key: 'steps',
      render: (_, w) => (
        <Steps
          size="small"
          progressDot
          current={-1}
          items={w.steps.map((s) => ({ title: s.name, description: s.approverType === 'ROLE' ? roleName(s.roleId) : APPROVER_TYPES[s.approverType].split(' ')[0] + '…' }))}
        />
      ),
    },
    { title: 'Số phiếu', key: 'n', width: 90, render: (_, w) => w._count.requests },
    { title: '', key: 'a', width: 50, render: (_, w) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(w)} aria-label="Sửa" /> },
  ];

  return (
    <>
      <PageHeader
        title="Quy trình duyệt"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            Thêm quy trình
          </Button>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">
          Sửa quy trình chỉ áp dụng cho phiếu gửi sau đó — phiếu đang chờ duyệt giữ nguyên các bước tại thời điểm gửi.
        </Typography.Paragraph>
        <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} scroll={{ x: 'max-content' }} />
      </Card>
      <WorkflowDrawer workflow={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function WorkflowDrawer({ workflow, open, onClose }: { workflow: Workflow | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const [saving, setSaving] = useState(false);
  const isNew = !workflow;

  const submit = async (v: ApiRecord) => {
    setSaving(true);
    try {
      const body = { ...v, description: v.description ?? '', steps: (v.steps as Step[]).map((s) => ({ ...s, roleId: s.roleId ?? null })) };
      if (isNew) await api('/approval-workflows', { method: 'POST', body });
      else await api(`/approval-workflows/${workflow.id}`, { method: 'PATCH', body: { ...body, code: workflow.code } });
      message.success('Đã lưu quy trình');
      queryClient.invalidateQueries({ queryKey: ['approval-workflows'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const initial = workflow
    ? { ...workflow, description: workflow.description ?? undefined }
    : { targetType: 'GENERAL', isActive: true, steps: [{ name: 'Trưởng đơn vị', approverType: 'UNIT_MANAGER' }] };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={isNew ? 'Thêm quy trình duyệt' : workflow.name}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          Lưu
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} key={workflow?.id ?? 'new'}>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="code" label="Mã" rules={[{ required: true, message: 'Nhập mã' }, zodRule(upsertWorkflowSchema.shape.code)]}>
              <Input disabled={!isNew} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="name" label="Tên quy trình" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="targetType" label="Áp dụng cho" rules={[{ required: true }]}>
              <Select options={Object.entries(APPROVAL_TARGET_TYPES).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="description" label="Mô tả">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Title level={5}>Các bước duyệt (theo thứ tự)</Typography.Title>
        <Form.List name="steps">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f, i) => (
                <Card key={f.key} size="small" title={`Bước ${i + 1}`} style={{ marginBottom: 12 }} extra={fields.length > 1 && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} aria-label="Xóa bước" />}>
                  <Row gutter={12}>
                    <Col xs={24} sm={8}>
                      <Form.Item name={[f.name, 'name']} label="Tên bước" rules={[{ required: true, message: 'Nhập tên bước' }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={16}>
                      <Form.Item name={[f.name, 'approverType']} label="Người duyệt" rules={[{ required: true }]}>
                        <Select options={Object.entries(APPROVER_TYPES).map(([value, label]) => ({ value, label }))} />
                      </Form.Item>
                    </Col>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) =>
                        getFieldValue(['steps', f.name, 'approverType']) === 'ROLE' && (
                          <Col span={24}>
                            <Form.Item name={[f.name, 'roleId']} label="Nhóm tài khoản duyệt" rules={[{ required: true, message: 'Chọn nhóm' }]}>
                              <Select options={roles?.map((r) => ({ value: r.id, label: r.name }))} />
                            </Form.Item>
                          </Col>
                        )
                      }
                    </Form.Item>
                  </Row>
                </Card>
              ))}
              <Space>
                <Button icon={<PlusOutlined />} onClick={() => add({ name: '', approverType: 'SELECTED' })} disabled={fields.length >= 10}>
                  Thêm bước
                </Button>
              </Space>
            </>
          )}
        </Form.List>
      </Form>
    </Drawer>
  );
}
