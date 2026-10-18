'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Statistic, Table, Tag, TreeSelect, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { api, downloadFile } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { errorMessage } from '@/lib/form';
import { formatDay, formatNumber } from '@/lib/format';
import { buildUnitTree, useUnits } from '@/lib/queries';

interface DutyRow {
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
  count: number;
  units: string;
  amount: string;
  missingRate: number;
  details: { date: string; shiftCode: string; symbol: string; units: string; rate: string | null; amount: string }[];
}

export default function DutyPayPage() {
  const { message } = App.useApp();
  const can = useCan();
  const showPay = can('duty.pay.read');
  const { data: units } = useUnits();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [unitId, setUnitId] = useState<string>();
  const query = { month, unitId };
  const { data, isFetching } = useQuery({
    queryKey: ['duty-report', query],
    queryFn: () => api<{ items: DutyRow[]; total: string; dutyCount: number; missingRate: boolean }>('/attendance/reports/duty', { query }),
  });

  return (
    <>
      <PageHeader
        title="Báo cáo trực, tiền trực"
        extra={<Button icon={<DownloadOutlined />} onClick={() => downloadFile('/attendance/reports/duty', { ...query, export: 'xlsx' }).catch((e) => message.error(errorMessage(e)))}>Xuất Excel</Button>}
      />
      {showPay && data?.missingRate && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Có ca trực chưa khai báo mức tiền trực tại ngày trực — tiền trực các ca đó tạm tính 0." action={<Link href="/attendance/shifts">Khai báo mức tiền trực</Link>} />
      )}
      <Card>
        <div className="bm-filters">
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(d) => d && setMonth(d.format('YYYY-MM'))} />
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" placeholder="Đơn vị" treeData={units ? buildUnitTree(units) : []} onChange={setUnitId} style={{ width: 260 }} />
          <Statistic title="Số ca trực" value={data?.dutyCount ?? 0} style={{ marginInline: 16 }} />
          {showPay && <Statistic title="Tổng tiền trực (đồng)" value={formatNumber(data?.total ?? 0, 0)} valueStyle={{ color: '#008046' }} style={{ marginInline: 16 }} />}
        </div>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Chỉ tính ca trực có kết quả công (đã chấm công đủ hoặc đã điều chỉnh). Bảng công tháng chưa chốt có thể còn thay đổi.
        </Typography.Paragraph>
        <Table
          rowKey={(r) => r.employee.id}
          size="middle"
          loading={isFetching}
          dataSource={data?.items}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                size="small"
                rowKey={(d) => `${d.date}-${d.shiftCode}`}
                pagination={false}
                dataSource={r.details}
                columns={[
                  { title: 'Ngày', dataIndex: 'date', render: formatDay },
                  { title: 'Ca trực', dataIndex: 'shiftCode' },
                  { title: 'Số công', dataIndex: 'units', render: (v) => formatNumber(v) },
                  ...(showPay
                    ? [
                        { title: 'Mức', dataIndex: 'rate', render: (v: string | null) => (v ? formatNumber(v, 0) : <Tag color="red">Chưa khai báo</Tag>) },
                        { title: 'Thành tiền', dataIndex: 'amount', render: (v: string) => formatNumber(v, 0) },
                      ]
                    : []),
                ]}
              />
            ),
          }}
          columns={[
            { title: 'Nhân viên', key: 'e', render: (_, r) => <Link href={`/hr/employees/${r.employee.id}`}>{r.employee.fullName} <Typography.Text type="secondary">({r.employee.code})</Typography.Text></Link> },
            { title: 'Đơn vị', key: 'u', render: (_, r) => r.employee.unit.name },
            { title: 'Số ca trực', dataIndex: 'count', align: 'right' },
            { title: 'Số công trực', dataIndex: 'units', align: 'right', render: (v) => formatNumber(v) },
            ...(showPay ? [{ title: 'Tiền trực (đồng)', dataIndex: 'amount', align: 'right' as const, render: (v: string) => <b>{formatNumber(v, 0)}</b> }] : []),
          ]}
        />
      </Card>
    </>
  );
}
