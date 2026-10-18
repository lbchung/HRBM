'use client';

import { DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Input, Select, Table, Tag, TreeSelect, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EMPLOYEE_STATUSES, GENDERS, type Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile, fileUrl } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useCampusFilter } from '@/lib/campus-filter';
import { useCatalogs } from '@/lib/catalogs';
import { errorMessage } from '@/lib/form';
import { formatDay } from '@/lib/format';
import { buildUnitTree, useCampuses, useUnits } from '@/lib/queries';
import { StatusTag } from './fields';
import { ImportModal } from './ImportModal';

interface EmployeeRow {
  id: string;
  code: string;
  fullName: string;
  gender: keyof typeof GENDERS;
  dateOfBirth: string | null;
  phone: string | null;
  status: string;
  positionCode: string | null;
  jobTitleCode: string | null;
  contractTypeCode: string | null;
  photoFileId: string | null;
  userId: string | null;
  source: string;
  campus: { name: string };
  unit: { name: string };
}

type Filters = {
  search?: string;
  campusId?: string;
  unitId?: string;
  status: string;
  positionCode?: string;
  jobTitleCode?: string;
  contractTypeCode?: string;
};

export default function EmployeesPage() {
  const { message } = App.useApp();
  const can = useCan();
  const catalogs = useCatalogs();
  const { campusId } = useCampusFilter();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  const [filters, setFilters] = useState<Filters>({ status: 'ACTIVE', campusId });
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Bộ chọn cơ sở trên header là bộ lọc mặc định
  useEffect(() => setFilters((f) => ({ ...f, campusId })), [campusId]);

  const query = { ...filters, includeSubUnits: filters.unitId ? true : undefined };
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['employees', query, page],
    queryFn: () => api<Paginated<EmployeeRow>>('/hr/employees', { query: { ...query, ...page } }),
    placeholderData: keepPreviousData,
  });

  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage((p) => ({ ...p, page: 1 }));
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile('/hr/employees/export', query, 'nhan-vien.xlsx');
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<EmployeeRow> = [
    {
      title: 'Nhân viên',
      key: 'name',
      fixed: 'left',
      render: (_, e) => (
        <Link href={`/hr/employees/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}>
          <Avatar src={e.photoFileId ? fileUrl(e.photoFileId) : undefined} style={{ background: 'var(--bm-primary)', flexShrink: 0 }}>
            {e.fullName.trim().split(/\s+/).pop()?.[0]}
          </Avatar>
          <span>
            <Typography.Text strong>{e.fullName}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {e.code} · {GENDERS[e.gender]}
              {e.dateOfBirth ? ` · ${formatDay(e.dateOfBirth)}` : ''}
            </Typography.Text>
          </span>
        </Link>
      ),
    },
    { title: 'Đơn vị', key: 'unit', render: (_, e) => e.unit.name },
    { title: 'Cơ sở', key: 'campus', render: (_, e) => e.campus.name, responsive: ['lg'] },
    { title: 'Chức vụ', dataIndex: 'positionCode', render: (v) => (v ? catalogs.name('POSITION', v) : '—'), responsive: ['md'] },
    { title: 'Chức danh', dataIndex: 'jobTitleCode', render: (v) => (v ? catalogs.name('JOB_TITLE', v) : '—'), responsive: ['xl'] },
    { title: 'Điện thoại', dataIndex: 'phone', render: (v) => v ?? '—', responsive: ['xl'] },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, e) => (
        <>
          <StatusTag status={e.status} />
          {e.source === 'FAST' && <Tag color="cyan">Fast</Tag>}
          {e.userId && <Tag>Có tài khoản</Tag>}
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Hồ sơ nhân viên"
        extra={
          <>
            {can('hr.employee.export') && (
              <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportXlsx}>
                Xuất Excel
              </Button>
            )}
            {can('hr.employee.import') && (
              <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
                Import Excel
              </Button>
            )}
            {can('hr.employee.create') && (
              <Link href="/hr/employees/new">
                <Button type="primary" icon={<PlusOutlined />}>
                  Thêm hồ sơ
                </Button>
              </Link>
            )}
          </>
        }
      />
      <Card>
        <div className="bm-filters">
          <Input.Search placeholder="Tìm mã, tên (không dấu), SĐT, email" allowClear onSearch={(v) => setFilter({ search: v || undefined })} style={{ width: 280 }} />
          <Select
            value={filters.campusId ?? ''}
            onChange={(v) => setFilter({ campusId: v || undefined })}
            options={[{ value: '', label: 'Tất cả cơ sở' }, ...(campuses?.map((c) => ({ value: c.id, label: c.name })) ?? [])]}
          />
          <TreeSelect
            allowClear
            showSearch
            treeNodeFilterProp="title"
            placeholder="Đơn vị (gồm đơn vị con)"
            treeData={units ? buildUnitTree(units) : []}
            onChange={(v) => setFilter({ unitId: v })}
            style={{ width: 260 }}
          />
          <Select
            value={filters.status}
            onChange={(v) => setFilter({ status: v })}
            options={[
              { value: 'ACTIVE', label: 'Đang công tác' },
              { value: 'ALL', label: 'Tất cả trạng thái' },
              ...Object.entries(EMPLOYEE_STATUSES).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Chức vụ" options={catalogs.items('POSITION').map((i) => ({ value: i.code, label: i.name }))} onChange={(v) => setFilter({ positionCode: v })} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Chức danh" options={catalogs.items('JOB_TITLE').map((i) => ({ value: i.code, label: i.name }))} onChange={(v) => setFilter({ jobTitleCode: v })} style={{ width: 220 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Loại hợp đồng" options={catalogs.items('CONTRACT_TYPE').map((i) => ({ value: i.code, label: i.name }))} onChange={(v) => setFilter({ contractTypeCode: v })} style={{ width: 240 }} />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: data?.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: (t) => `${t.toLocaleString('vi-VN')} nhân viên`,
            onChange: (p, s) => setPage({ page: p, pageSize: s }),
          }}
        />
      </Card>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => refetch()} />
    </>
  );
}
