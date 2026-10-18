'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, TreeSelect } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { createUnitSchema, UNIT_TYPE_LABELS, UNIT_TYPES, type UnitType } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { buildUnitTree, useCampuses, useUnits, type Unit } from '@/lib/queries';

type UnitNode = Unit & { children?: UnitNode[] };

function toTree(units: Unit[]): UnitNode[] {
  const ids = new Set(units.map((u) => u.id));
  const byParent = new Map<string | null, Unit[]>();
  for (const u of units) {
    const p = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), u]);
  }
  const build = (p: string | null): UnitNode[] =>
    (byParent.get(p) ?? []).map((u) => {
      const children = build(u.id);
      return { ...u, children: children.length ? children : undefined };
    });
  return build(null);
}

const TYPE_COLOR: Record<UnitType, string> = { KHOA: 'green', PHONG: 'blue', TRUNG_TAM: 'purple', VIEN: 'magenta', KHAC: 'default' };

export default function UnitsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const canManage = can('org.unit.manage');
  const { data: units, isLoading } = useUnits();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<UnitType>();
  const [editing, setEditing] = useState<Unit | 'new' | null>(null);

  const dataSource = useMemo(() => {
    if (!units) return [];
    const q = search.trim().toLowerCase();
    if (!q && !typeFilter) return toTree(units);
    // Đang lọc → hiển thị danh sách phẳng
    return units.filter(
      (u) => (!q || u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q)) && (!typeFilter || u.type === typeFilter),
    );
  }, [units, search, typeFilter]);

  const remove = (u: Unit) =>
    modal.confirm({
      title: 'Xóa đơn vị',
      content: `Xóa đơn vị "${u.name}"?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/org/units/${u.id}`, { method: 'DELETE' });
          message.success('Đã xóa đơn vị');
          queryClient.invalidateQueries({ queryKey: ['units'] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  const columns: ColumnsType<UnitNode> = [
    { title: 'Tên đơn vị', dataIndex: 'name' },
    { title: 'Mã', dataIndex: 'code', width: 110 },
    { title: 'Loại', dataIndex: 'type', render: (t: UnitType) => <Tag color={TYPE_COLOR[t]}>{UNIT_TYPE_LABELS[t]}</Tag> },
    { title: 'Cơ sở', dataIndex: ['campus', 'name'], render: (v) => v ?? 'Cả hai cơ sở', responsive: ['md'] },
    { title: 'Tài khoản', dataIndex: ['_count', 'users'], align: 'right', responsive: ['lg'] },
    { title: 'Trạng thái', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">Hoạt động</Tag> : <Tag>Ngừng</Tag>), responsive: ['lg'] },
    ...(canManage
      ? [
          {
            title: '',
            key: 'a',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, u: Unit) => (
              <Space size={0}>
                <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(u)} aria-label="Sửa" />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(u)} aria-label="Xóa" />
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Đơn vị"
        extra={
          canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Thêm đơn vị
            </Button>
          )
        }
      />
      <Card>
        <div className="bm-filters">
          <Input.Search placeholder="Tìm tên, mã đơn vị" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
          <Select allowClear placeholder="Loại đơn vị" options={UNIT_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_LABELS[t] }))} onChange={setTypeFilter} />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={dataSource}
          loading={isLoading}
          pagination={false}
          expandable={{ defaultExpandAllRows: true }}
          scroll={{ x: 'max-content' }}
          footer={() => `${units?.length ?? 0} đơn vị`}
        />
      </Card>
      <UnitModal unit={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function UnitModal({ unit, open, onClose }: { unit: Unit | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  const [saving, setSaving] = useState(false);
  const isNew = !unit;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (unit) form.setFieldsValue({ ...unit, shortName: unit.shortName ?? '' });
  }, [open, unit, form]);

  const submit = async (v: Record<string, unknown>) => {
    setSaving(true);
    const body: Record<string, unknown> = { ...v, parentId: v.parentId ?? null, campusId: v.campusId ?? null };
    try {
      if (isNew) await api('/org/units', { method: 'POST', body });
      else {
        const { code: _code, ...rest } = body;
        await api(`/org/units/${unit.id}`, { method: 'PATCH', body: rest });
      }
      message.success('Đã lưu đơn vị');
      queryClient.invalidateQueries({ queryKey: ['units'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title={isNew ? 'Thêm đơn vị' : 'Sửa đơn vị'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ type: 'KHOA', sortOrder: 0, isActive: true }}>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true, message: 'Nhập mã' }, zodRule(createUnitSchema.shape.code)]}>
              <Input disabled={!isNew} placeholder="vd: K.NOI" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true, message: 'Nhập tên đơn vị' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
              <Select options={UNIT_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_LABELS[t] }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="shortName" label="Tên viết tắt">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="parentId" label="Trực thuộc">
              <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeDefaultExpandAll treeData={units ? buildUnitTree(units, unit?.id) : []} placeholder="Đơn vị cấp cao nhất" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="campusId" label="Cơ sở chính" extra="Bỏ trống nếu đơn vị hoạt động ở cả hai cơ sở">
              <Select allowClear options={campuses?.map((c) => ({ value: c.id, label: c.name }))} placeholder="Cả hai cơ sở" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="sortOrder" label="Thứ tự">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
