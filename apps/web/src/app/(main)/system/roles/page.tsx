'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, Col, Drawer, Form, Input, Row, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { createRoleSchema, DATA_SCOPE_LABELS, DATA_SCOPES, type DataScope, type PermissionDef } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { useRoles, type Role } from '@/lib/queries';

interface Catalog {
  modules: Record<string, string>;
  permissions: PermissionDef[];
}

interface RoleDetail extends Omit<Role, 'userCount' | 'permissionCount'> {
  permissionCodes: string[];
}

const SCOPE_COLOR: Record<DataScope, string> = { ALL: 'green', CAMPUS: 'blue', UNIT: 'gold', SELF: 'default' };

export default function RolesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const { data: roles, isLoading } = useRoles();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  const remove = (r: Role) =>
    modal.confirm({
      title: 'Xóa nhóm tài khoản',
      content: `Xóa nhóm "${r.name}"?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/roles/${r.id}`, { method: 'DELETE' });
          message.success('Đã xóa nhóm');
          queryClient.invalidateQueries({ queryKey: ['roles'] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  const columns: ColumnsType<Role> = [
    {
      title: 'Nhóm tài khoản',
      key: 'name',
      render: (_, r) => (
        <div>
          <Typography.Text strong>{r.name}</Typography.Text> {r.isSystem && <Tag>Hệ thống</Tag>}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.code}
              {r.description ? ` · ${r.description}` : ''}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Phạm vi dữ liệu',
      dataIndex: 'dataScope',
      render: (s: DataScope) => <Tag color={SCOPE_COLOR[s]}>{DATA_SCOPE_LABELS[s]}</Tag>,
    },
    { title: 'Số quyền', dataIndex: 'permissionCount', align: 'right' },
    { title: 'Số tài khoản', dataIndex: 'userCount', align: 'right' },
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} aria-label="Sửa" />
          {can('system.role.manage') && !r.isSystem && (
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(r)} aria-label="Xóa" />
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Nhóm tài khoản & phân quyền"
        extra={
          can('system.role.manage') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Thêm nhóm
            </Button>
          )
        }
      />
      <Card>
        <Table rowKey="id" columns={columns} dataSource={roles} loading={isLoading} pagination={false} scroll={{ x: 'max-content' }} />
      </Card>
      <RoleDrawer
        role={editing === 'new' ? null : editing}
        open={editing !== null}
        readOnly={!can('system.role.manage')}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          message.success('Đã lưu nhóm tài khoản');
          queryClient.invalidateQueries({ queryKey: ['roles'] });
          queryClient.invalidateQueries({ queryKey: ['me'] });
        }}
      />
    </>
  );
}

function RoleDrawer({
  role,
  open,
  readOnly,
  onClose,
  onSaved,
}: {
  role: Role | null;
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const isNew = !role;
  const isAdmin = role?.code === 'ADMIN';

  const { data: catalog } = useQuery({ queryKey: ['permission-catalog'], queryFn: () => api<Catalog>('/permissions'), staleTime: Infinity });
  const { data: detail, isFetching } = useQuery({
    queryKey: ['role', role?.id],
    queryFn: () => api<RoleDetail>(`/roles/${role!.id}`),
    enabled: open && !!role,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (isNew) {
      form.setFieldsValue({ dataScope: 'SELF' });
      setSelected([]);
    } else if (detail) {
      form.setFieldsValue({ code: detail.code, name: detail.name, description: detail.description, dataScope: detail.dataScope });
      setSelected(detail.permissionCodes);
    }
  }, [open, isNew, detail, form]);

  const grouped = useMemo(() => {
    const g = new Map<string, PermissionDef[]>();
    for (const p of catalog?.permissions ?? []) g.set(p.module, [...(g.get(p.module) ?? []), p]);
    return [...g.entries()];
  }, [catalog]);

  const toggleModule = (codes: string[], checked: boolean) =>
    setSelected((s) => (checked ? [...new Set([...s, ...codes])] : s.filter((c) => !codes.includes(c))));

  const submit = async (v: { code: string; name: string; description?: string; dataScope: DataScope }) => {
    setSaving(true);
    try {
      const body = { name: v.name, description: v.description ?? '', dataScope: v.dataScope, permissionCodes: selected };
      if (isNew) await api('/roles', { method: 'POST', body: { ...body, code: v.code } });
      else await api(`/roles/${role.id}`, { method: 'PATCH', body: isAdmin ? { name: v.name, description: v.description ?? '' } : body });
      onSaved();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const locked = readOnly || isAdmin;

  return (
    <Drawer
      title={isNew ? 'Thêm nhóm tài khoản' : role.name}
      open={open}
      onClose={onClose}
      width={760}
      destroyOnHidden
      extra={
        !readOnly && (
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            Lưu
          </Button>
        )
      }
    >
      <Spin spinning={isFetching}>
        <Form form={form} layout="vertical" onFinish={submit} disabled={readOnly}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="code" label="Mã nhóm" rules={isNew ? [{ required: true, message: 'Nhập mã nhóm' }, zodRule(createRoleSchema.shape.code)] : []}>
                <Input disabled={!isNew} placeholder="vd: KE_TOAN_VIEN" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="name" label="Tên nhóm" rules={[{ required: true, message: 'Nhập tên nhóm' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="description" label="Mô tả">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="dataScope" label="Phạm vi dữ liệu" rules={[{ required: true }]}>
                <Select disabled={locked} options={DATA_SCOPES.map((s) => ({ value: s, label: DATA_SCOPE_LABELS[s] }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          Quyền chức năng ({selected.length})
        </Typography.Title>
        {isAdmin && (
          <Typography.Paragraph type="secondary">Nhóm Quản trị hệ thống luôn có toàn bộ quyền.</Typography.Paragraph>
        )}
        <Row gutter={[12, 12]}>
          {grouped.map(([module, perms]) => {
            const codes = perms.map((p) => p.code);
            const count = codes.filter((c) => selected.includes(c)).length;
            return (
              <Col xs={24} md={12} key={module}>
                <Card
                  size="small"
                  title={
                    <Checkbox
                      disabled={locked}
                      checked={count === codes.length}
                      indeterminate={count > 0 && count < codes.length}
                      onChange={(e) => toggleModule(codes, e.target.checked)}
                    >
                      {catalog?.modules[module] ?? module}
                    </Checkbox>
                  }
                  extra={<Typography.Text type="secondary">{count}/{codes.length}</Typography.Text>}
                >
                  <Checkbox.Group
                    disabled={locked}
                    value={selected.filter((c) => codes.includes(c))}
                    onChange={(vals) => setSelected((s) => [...s.filter((c) => !codes.includes(c)), ...(vals as string[])])}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                    options={perms.map((p) => ({ value: p.code, label: p.name }))}
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      </Spin>
    </Drawer>
  );
}
