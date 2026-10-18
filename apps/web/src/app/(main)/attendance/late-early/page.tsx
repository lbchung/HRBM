'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Select, Statistic, Table, Tag, TreeSelect, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile } from '@/lib/api';
import { vnTime } from '@/lib/attendance';
import { useCampusFilter } from '@/lib/campus-filter';
import { errorMessage } from '@/lib/form';
import { formatDay } from '@/lib/format';
import { buildUnitTree, useCampuses, useUnits } from '@/lib/queries';

interface Row {
  id: string;
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  isLate: boolean;
  isEarly: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
  shift: { code: string; name: string } | null;
}

export default function LateEarlyPage() {
  const { message } = App.useApp();
  const { campusId: globalCampus } = useCampusFilter();
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [unitId, setUnitId] = useState<string>();
  const [campusId, setCampusId] = useState<string | undefined>(globalCampus);
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const query = { month, unitId, campusId };
  const { data, isFetching } = useQuery({
    queryKey: ['late-early', query, page],
    queryFn: () => api<Paginated<Row> & { summary: { lateMinutes: number; earlyMinutes: number } }>('/attendance/reports/late-early', { query: { ...query, ...page } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Báo cáo đi muộn, về sớm"
        extra={<Button icon={<DownloadOutlined />} onClick={() => downloadFile('/attendance/reports/late-early', { ...query, export: 'xlsx' }).catch((e) => message.error(errorMessage(e)))}>Xuất Excel</Button>}
      />
      <Card>
        <div className="bm-filters">
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(d) => d && setMonth(d.format('YYYY-MM'))} />
          <Select value={campusId ?? ''} onChange={(v) => setCampusId(v || undefined)} options={[{ value: '', label: 'Tất cả cơ sở' }, ...(campuses?.map((c) => ({ value: c.id, label: c.name })) ?? [])]} />
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Đơn vị" treeData={units ? buildUnitTree(units) : []} onChange={setUnitId} style={{ width: 260 }} />
          <Statistic title="Lượt" value={data?.total ?? 0} style={{ marginInline: 16 }} />
          <Statistic title="Tổng phút muộn" value={data?.summary.lateMinutes ?? 0} valueStyle={{ color: '#d46b08' }} style={{ marginInline: 16 }} />
          <Statistic title="Tổng phút về sớm" value={data?.summary.earlyMinutes ?? 0} style={{ marginInline: 16 }} />
        </div>
        <Table
          rowKey="id"
          size="small"
          loading={isFetching}
          dataSource={data?.items}
          scroll={{ x: 'max-content' }}
          pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
          columns={[
            { title: 'Ngày', dataIndex: 'date', render: formatDay },
            { title: 'Nhân viên', key: 'e', render: (_, r: Row) => <Link href={`/hr/employees/${r.employee.id}`}>{r.employee.fullName} <Typography.Text type="secondary">({r.employee.code})</Typography.Text></Link> },
            { title: 'Đơn vị', key: 'u', render: (_, r: Row) => r.employee.unit.name },
            { title: 'Ca', key: 's', render: (_, r: Row) => r.shift?.code ?? '—' },
            { title: 'Giờ vào', dataIndex: 'firstIn', render: vnTime },
            { title: 'Giờ ra', dataIndex: 'lastOut', render: vnTime },
            { title: 'Đi muộn', key: 'l', render: (_, r: Row) => (r.isLate ? <Tag color="orange">{r.lateMinutes} phút</Tag> : '') },
            { title: 'Về sớm', key: 'x', render: (_, r: Row) => (r.isEarly ? <Tag color="gold">{r.earlyMinutes} phút</Tag> : '') },
          ]}
        />
      </Card>
    </>
  );
}
