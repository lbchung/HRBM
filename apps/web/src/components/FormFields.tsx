'use client';

import { PaperClipOutlined } from '@ant-design/icons';
import { Col, DatePicker, Form, Input, InputNumber, Row, Select, Switch, TreeSelect } from 'antd';
import type { ReactNode } from 'react';
import type { CatalogType } from '@bachmai/shared';
import { fileUrl } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { useCatalogs } from '@/lib/catalogs';
import { formatDay, formatNumber, fromDayjs, toDayjs } from '@/lib/format';
import { buildUnitTree, useCampuses, useUnits } from '@/lib/queries';
import { FileUpload } from './FileUpload';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'decimal'
  | 'catalog'
  | 'select'
  | 'unit'
  | 'campus'
  | 'switch'
  | 'file';

/**
 * Khai báo trường dùng chung cho form và bảng — một nguồn duy nhất cho nhãn, kiểu, cách hiển thị.
 * Kiểu ngày tự chuyển dayjs ↔ "YYYY-MM-DD"; ô trống gửi '' để API xóa giá trị.
 */
export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  catalog?: CatalogType;
  options?: { value: string; label: string }[];
  /** Độ rộng cột trên lưới 24 (mặc định 12) */
  span?: number;
  help?: string;
  placeholder?: string;
  /** Chỉ có trong form (không lưu / không hiện ở bảng) */
  formOnly?: boolean;
  /** Chỉ hiển thị ở bảng (không có trong form) */
  tableOnly?: boolean;
  /** Không sửa được khi cập nhật */
  lockOnEdit?: boolean;
  /** Hiện ở bảng danh sách */
  table?: boolean;
  /** Hiển thị tùy biến ở bảng / chi tiết */
  render?: (row: ApiRecord) => ReactNode;
}

function FieldControl({ field, disabled }: { field: FieldDef; disabled?: boolean }) {
  const catalogs = useCatalogs();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea rows={3} disabled={disabled} placeholder={field.placeholder} />;
    case 'date':
      return <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={disabled} />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} disabled={disabled} placeholder={field.placeholder} />;
    case 'decimal':
      return <InputNumber<string> stringMode style={{ width: '100%' }} decimalSeparator="," disabled={disabled} placeholder={field.placeholder} />;
    case 'catalog':
      return (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          disabled={disabled}
          options={catalogs.items(field.catalog!).map((i) => ({ value: i.code, label: `${i.name}${i.code.length <= 12 ? ` (${i.code})` : ''}` }))}
        />
      );
    case 'select':
      return <Select allowClear disabled={disabled} options={field.options} />;
    case 'unit':
      return <TreeSelect allowClear showSearch treeNodeFilterProp="title" disabled={disabled} treeData={units ? buildUnitTree(units) : []} />;
    case 'campus':
      return <Select allowClear disabled={disabled} options={campuses?.map((c) => ({ value: c.id, label: c.name }))} />;
    case 'switch':
      return <Switch disabled={disabled} />;
    case 'file':
      return <FileUpload disabled={disabled} />;
    default:
      return <Input disabled={disabled} placeholder={field.placeholder} />;
  }
}

export function FormFields({ fields, isEdit, readOnly }: { fields: FieldDef[]; isEdit?: boolean; readOnly?: boolean }) {
  return (
    <Row gutter={16}>
      {fields.filter((f) => !f.tableOnly).map((f) => (
        <Col xs={24} sm={f.span ?? 12} key={f.name}>
          <Form.Item
            name={f.name}
            label={f.label}
            extra={f.help}
            valuePropName={f.type === 'switch' ? 'checked' : 'value'}
            rules={f.required ? [{ required: true, message: `Nhập ${f.label.toLowerCase()}` }] : undefined}
          >
            <FieldControl field={f} disabled={readOnly || (isEdit && f.lockOnEdit)} />
          </Form.Item>
        </Col>
      ))}
    </Row>
  );
}

/** Bản ghi API → giá trị form */
export function toFormValues(fields: FieldDef[], record: ApiRecord | null | undefined) {
  const v: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = record?.[f.name];
    if (f.type === 'date') v[f.name] = toDayjs(raw);
    else if (f.type === 'decimal') v[f.name] = raw === null || raw === undefined ? undefined : String(raw);
    else if (f.type === 'switch') v[f.name] = !!raw;
    else v[f.name] = raw ?? undefined;
  }
  return v;
}

/** Giá trị form → body gửi API */
export function fromFormValues(fields: FieldDef[], values: ApiRecord) {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.tableOnly) continue;
    const raw = values[f.name];
    if (f.type === 'date') body[f.name] = fromDayjs(raw);
    else if (f.type === 'switch') body[f.name] = !!raw;
    else if (f.type === 'unit' || f.type === 'campus' || f.type === 'file') body[f.name] = raw ?? null;
    else body[f.name] = raw === undefined || raw === null ? '' : raw;
  }
  return body;
}

/** Hiển thị giá trị một trường (bảng, trang chi tiết). */
export function useFieldRenderer() {
  const catalogs = useCatalogs();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  return (f: FieldDef, row: ApiRecord): ReactNode => {
    if (f.render) return f.render(row);
    const v = row[f.name];
    if (v === null || v === undefined || v === '') return '—';
    switch (f.type) {
      case 'date':
        return formatDay(v);
      case 'decimal':
      case 'number':
        return formatNumber(v);
      case 'catalog':
        return catalogs.name(f.catalog!, v);
      case 'select':
        return f.options?.find((o) => o.value === v)?.label ?? v;
      case 'unit':
        return units?.find((u) => u.id === v)?.name ?? '—';
      case 'campus':
        return campuses?.find((c) => c.id === v)?.name ?? '—';
      case 'switch':
        return v ? 'Có' : 'Không';
      case 'file':
        return (
          <a href={fileUrl(v)} target="_blank" rel="noreferrer">
            <PaperClipOutlined /> Xem
          </a>
        );
      default:
        return String(v);
    }
  };
}
