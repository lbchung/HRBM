'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, InputNumber, Select, Table, TreeSelect, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { CatalogType, Paginated } from '@bachmai/shared';
import { api, downloadFile, type Query } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { useCampusFilter } from '@/lib/campus-filter';
import { useCatalogs } from '@/lib/catalogs';
import { errorMessage } from '@/lib/form';
import { buildUnitTree, useCampuses, useUnits } from '@/lib/queries';
import { PageHeader } from './PageHeader';

export type ReportRow = ApiRecord & { id: string };

interface Props {
  title: string;
  endpoint: string;
  columns: ColumnsType<ReportRow>;
  /** Lọc theo loại (mã danh mục) */
  typeCatalog?: CatalogType;
  typeLabel?: string;
  showYear?: boolean;
  /** Hiện bộ lọc "hết hạn trong N ngày" */
  showExpiring?: boolean;
  /** Giá trị mặc định của bộ lọc hết hạn */
  expiringDays?: number;
  showMonth?: boolean;
  extra?: ReactNode;
  /** Tên tham số lọc cơ sở (assignments lọc theo cơ sở được phân công) */
  campusLabel?: string;
}

export const employeeColumns: ColumnsType<ReportRow> = [
  {
    title: 'Nhân viên',
    key: 'employee',
    fixed: 'left',
    render: (_, r) => (
      <Link href={`/hr/employees/${r.employee.id}`}>
        <Typography.Text strong>{r.employee.fullName}</Typography.Text>
        <br />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {r.employee.code}
        </Typography.Text>
      </Link>
    ),
  },
  { title: 'Đơn vị', key: 'unit', render: (_, r) => r.employee.unit?.name },
];

export function ReportPage({ title, endpoint, columns, typeCatalog, typeLabel, showYear, showExpiring, expiringDays, showMonth, extra, campusLabel }: Props) {
  const { message } = App.useApp();
  const catalogs = useCatalogs();
  const { campusId } = useCampusFilter();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  const [filters, setFilters] = useState<Query>({ campusId, expiringWithinDays: expiringDays, month: showMonth ? new Date().toISOString().slice(0, 7) : undefined });
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [exporting, setExporting] = useState(false);

  useEffect(() => setFilters((f) => ({ ...f, campusId })), [campusId]);

  const { data, isFetching } = useQuery({
    queryKey: [endpoint, filters, page],
    queryFn: () => api<Paginated<ReportRow>>(endpoint, { query: { ...filters, ...page } }),
    placeholderData: keepPreviousData,
  });

  const setFilter = (patch: Query) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage((p) => ({ ...p, page: 1 }));
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(endpoint, { ...filters, export: 'xlsx' }, 'bao-cao.xlsx');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        extra={
          <>
            {extra}
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportXlsx}>
              Xuất Excel
            </Button>
          </>
        }
      />
      <Card>
        <div className="bm-filters">
          <Select
            value={(filters.campusId as string) ?? ''}
            onChange={(v) => setFilter({ campusId: v || undefined })}
            options={[{ value: '', label: campusLabel ? `${campusLabel}: tất cả` : 'Tất cả cơ sở' }, ...(campuses?.map((c) => ({ value: c.id, label: c.name })) ?? [])]}
          />
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Đơn vị" treeData={units ? buildUnitTree(units) : []} onChange={(v) => setFilter({ unitId: v })} style={{ width: 240 }} />
          {typeCatalog && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={typeLabel ?? 'Loại'}
              options={catalogs.items(typeCatalog).map((i) => ({ value: i.code, label: i.name }))}
              onChange={(v) => setFilter({ typeCode: v })}
              style={{ width: 240 }}
            />
          )}
          {showYear && <InputNumber placeholder="Năm" min={1950} max={2100} onChange={(v) => setFilter({ year: v ?? undefined })} />}
          {showExpiring && (
            <Select
              value={filters.expiringWithinDays ?? ''}
              onChange={(v) => setFilter({ expiringWithinDays: v === '' ? undefined : v })}
              options={[
                { value: '', label: 'Không lọc hạn' },
                { value: 30, label: 'Hết hạn trong 30 ngày' },
                { value: 60, label: 'Hết hạn trong 60 ngày' },
                { value: 90, label: 'Hết hạn trong 90 ngày' },
                { value: 180, label: 'Hết hạn trong 180 ngày' },
              ]}
            />
          )}
          {showMonth && (
            <DatePicker
              picker="month"
              format="MM/YYYY"
              allowClear
              placeholder="Tháng"
              value={filters.month ? dayjs(`${filters.month}-01`) : null}
              onChange={(d) => setFilter({ month: d ? d.format('YYYY-MM') : undefined })}
            />
          )}
        </div>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={data?.items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `${t.toLocaleString('vi-VN')} bản ghi`,
            onChange: (p, s) => setPage({ page: p, pageSize: s }),
          }}
        />
      </Card>
    </>
  );
}
