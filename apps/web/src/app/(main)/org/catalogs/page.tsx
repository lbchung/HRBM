'use client';

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, InputNumber, Menu, Modal, Row, Select, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { CATALOG_TYPES, createCatalogItemSchema, type CatalogMetaField, type CatalogType } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import type { CatalogItem } from '@/lib/catalogs';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';

interface TypeInfo {
  code: CatalogType;
  label: string;
  group: string;
  description?: string;
  metaFields?: CatalogMetaField[];
  count: number;
}

export default function CatalogsPage() {
  const [type, setType] = useState<CatalogType>('POSITION');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const { data: types } = useQuery({ queryKey: ['catalog-types'], queryFn: () => api<TypeInfo[]>('/catalogs/types') });
  const { data: items, isLoading } = useQuery({
    queryKey: ['catalogs', type],
    queryFn: () => api<CatalogItem[]>('/catalogs', { query: { type, includeInactive: true } }),
  });
  const def = CATALOG_TYPES[type] as { label: string; description?: string; metaFields?: CatalogMetaField[] };

  const menuItems = useMemo(() => {
    const groups = new Map<string, TypeInfo[]>();
    for (const t of types ?? []) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
    return [...groups.entries()].map(([group, list]) => ({
      type: 'group' as const,
      key: group,
      label: group,
      children: list.map((t) => ({ key: t.code, label: `${t.label} (${t.count})` })),
    }));
  }, [types]);

  const filtered = (items ?? []).filter((i) => {
    const q = search.trim().toLowerCase();
    return !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
  });

  const columns: ColumnsType<CatalogItem> = [
    { title: 'Mã', dataIndex: 'code', width: 140 },
    { title: 'Tên', dataIndex: 'name' },
    ...(def.metaFields ?? []).map((m) => ({
      title: m.label,
      key: m.key,
      render: (_: unknown, i: CatalogItem) => {
        const v = i.meta?.[m.key];
        return m.options?.find((o) => o.value === v)?.label ?? v ?? '—';
      },
    })),
    { title: 'Thứ tự', dataIndex: 'sortOrder', width: 80, responsive: ['md'] },
    { title: 'Trạng thái', dataIndex: 'isActive', width: 110, render: (v: boolean) => (v ? <Tag color="green">Đang dùng</Tag> : <Tag>Ngừng dùng</Tag>) },
    { title: '', key: 'a', width: 50, render: (_, i) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(i)} aria-label="Sửa" /> },
  ];

  return (
    <>
      <PageHeader title="Danh mục dùng chung" />
      <Row gutter={16}>
        <Col xs={24} lg={6}>
          <Card size="small" styles={{ body: { padding: 0 } }} style={{ marginBottom: 16 }}>
            <Menu mode="inline" selectedKeys={[type]} items={menuItems} onClick={(e) => setType(e.key as CatalogType)} style={{ borderInlineEnd: 0 }} />
          </Card>
        </Col>
        <Col xs={24} lg={18}>
          <Card
            title={def.label}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
                Thêm
              </Button>
            }
          >
            {def.description && <Typography.Paragraph type="secondary">{def.description}</Typography.Paragraph>}
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              Mã danh mục không đổi được sau khi tạo (hồ sơ tham chiếu theo mã). Mục không còn dùng hãy chuyển sang “Ngừng dùng”.
            </Typography.Paragraph>
            <Input.Search placeholder="Tìm mã, tên" allowClear onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300, marginBottom: 12 }} />
            <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} loading={isLoading} pagination={{ pageSize: 50 }} scroll={{ x: 'max-content' }} />
          </Card>
        </Col>
      </Row>
      <ItemModal type={type} item={editing === 'new' ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </>
  );
}

function ItemModal({ type, item, open, onClose }: { type: CatalogType; item: CatalogItem | null; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const def = CATALOG_TYPES[type] as { label: string; metaFields?: CatalogMetaField[] };
  const isNew = !item;

  const submit = async (v: ApiRecord) => {
    setSaving(true);
    const meta = Object.fromEntries((def.metaFields ?? []).map((m) => [m.key, v[`meta_${m.key}`] ?? null]));
    const body = { name: v.name, description: v.description ?? '', sortOrder: v.sortOrder ?? 0, isActive: v.isActive, meta };
    try {
      if (isNew) await api('/catalogs', { method: 'POST', body: { ...body, type, code: v.code } });
      else await api(`/catalogs/${item.id}`, { method: 'PATCH', body });
      message.success('Đã lưu');
      queryClient.invalidateQueries({ queryKey: ['catalogs'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-types'] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const initial = {
    code: item?.code,
    name: item?.name,
    description: item?.description ?? undefined,
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
    ...Object.fromEntries((def.metaFields ?? []).map((m) => [`meta_${m.key}`, item?.meta?.[m.key] ?? undefined])),
  };

  return (
    <Modal open={open} title={`${isNew ? 'Thêm' : 'Sửa'}: ${def.label}`} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Lưu" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} key={item?.id ?? 'new'}>
        <Form.Item name="code" label="Mã" rules={isNew ? [{ required: true, message: 'Nhập mã' }, zodRule(createCatalogItemSchema.shape.code)] : []}>
          <Input disabled={!isNew} />
        </Form.Item>
        <Form.Item name="name" label="Tên" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input />
        </Form.Item>
        {(def.metaFields ?? []).map((m) => (
          <Form.Item key={m.key} name={`meta_${m.key}`} label={m.label}>
            {m.type === 'select' ? <Select allowClear options={m.options} /> : m.type === 'number' ? <InputNumber style={{ width: '100%' }} /> : <Input />}
          </Form.Item>
        ))}
        <Form.Item name="description" label="Mô tả">
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="sortOrder" label="Thứ tự">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
