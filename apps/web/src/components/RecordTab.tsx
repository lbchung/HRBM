'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Form, Modal, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { FormFields, fromFormValues, toFormValues, useFieldRenderer, type FieldDef } from './FormFields';

interface Props {
  /** Đường dẫn API danh sách, vd /hr/employees/:id/contracts */
  endpoint: string;
  title: string;
  fields: FieldDef[];
  canEdit: boolean;
  /** Giá trị mặc định khi thêm mới */
  defaults?: Record<string, unknown>;
  modalWidth?: number;
  /** Gọi sau khi lưu/xóa (vd làm mới hồ sơ khi quá trình công tác cập nhật đơn vị) */
  onChanged?: () => void;
}

type Row = ApiRecord & { id: string };

/** Bảng hồ sơ con có thêm / sửa / xóa, sinh tự động từ danh sách FieldDef. */
export function RecordTab({ endpoint, title, fields, canEdit, defaults, modalWidth = 720, onChanged }: Props) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const render = useFieldRenderer();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: [endpoint], queryFn: () => api<Row[]>(endpoint) });

  const [initial, setInitial] = useState<Record<string, unknown>>({});
  const open = (row: Row | 'new') => {
    setInitial(toFormValues(fields, row === 'new' ? (defaults ?? {}) : row));
    setEditing(row);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    onChanged?.();
  };

  const submit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const body = fromFormValues(fields, values);
      if (editing === 'new') await api(endpoint, { method: 'POST', body });
      else if (editing) await api(`${endpoint}/${editing.id}`, { method: 'PATCH', body });
      message.success('Đã lưu');
      setEditing(null);
      refresh();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: Row) =>
    modal.confirm({
      title: `Xóa bản ghi ${title.toLowerCase()}?`,
      okButtonProps: { danger: true },
      okText: 'Xóa',
      onOk: async () => {
        try {
          await api(`${endpoint}/${row.id}`, { method: 'DELETE' });
          message.success('Đã xóa');
          refresh();
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  const columns: ColumnsType<Row> = [
    ...fields
      .filter((f) => f.table && !f.formOnly)
      .map((f) => ({ title: f.label, key: f.name, render: (_: unknown, row: Row) => render(f, row) })),
    ...(canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, row: Row) => (
              <Space size={0}>
                <Button type="text" icon={<EditOutlined />} onClick={() => open(row)} aria-label="Sửa" />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(row)} aria-label="Xóa" />
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      size="small"
      title={title}
      extra={
        canEdit && (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => open('new')}>
            Thêm
          </Button>
        )
      }
      style={{ marginBottom: 16 }}
    >
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" /> }}
      />
      <Modal
        open={editing !== null}
        title={`${editing === 'new' ? 'Thêm' : 'Sửa'}: ${title}`}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Lưu"
        width={modalWidth}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={initial} key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}>
          <FormFields fields={fields} isEdit={editing !== 'new'} />
        </Form>
      </Modal>
    </Card>
  );
}
