'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, DatePicker, Result, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useState } from 'react';
import { TIMESHEET_STATUSES, type MonthTotals, type TimesheetStatus } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { STATUS_COLOR, vnTime, weekday } from '@/lib/attendance';
import { formatDay, formatNumber } from '@/lib/format';

interface MyRow {
  id: string;
  date: string;
  status: TimesheetStatus;
  symbol: string;
  workUnits: string;
  firstIn: string | null;
  lastOut: string | null;
  isLate: boolean;
  isEarly: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  overrideReason: string | null;
  shift: { code: string; name: string } | null;
}

export default function MyTimesheetPage() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const year = Number(month.slice(0, 4));
  const { data, isLoading } = useQuery({
    queryKey: ['my-timesheet', month],
    queryFn: () => api<{ employee: { code: string; fullName: string }; rows: MyRow[]; totals: MonthTotals } | null>('/attendance/me/timesheet', { query: { month } }),
  });
  const { data: balance } = useQuery({
    queryKey: ['my-balance', year],
    queryFn: () => api<{ entitled: string; used: string; pending: string; remaining: string } | null>(`/leave/balances/me`, { query: { year } }),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (data === null) return <Result status="info" title="Tài khoản chưa liên kết hồ sơ nhân sự" subTitle="Liên hệ Phòng Tổ chức cán bộ để liên kết." />;
  const t = data?.totals;

  return (
    <>
      <PageHeader
        title="Công của tôi"
        extra={<DatePicker picker="month" format="MM/YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(d) => d && setMonth(d.format('YYYY-MM'))} />}
      />
      <Row gutter={[16, 16]}>
        {[
          { title: 'Tổng công', value: formatNumber(t?.workUnits ?? 0, 2) },
          { title: 'Ca trực', value: t?.dutyCount ?? 0 },
          { title: 'Đi muộn (lần)', value: t?.lateCount ?? 0 },
          { title: 'Về sớm (lần)', value: t?.earlyCount ?? 0 },
          { title: `Phép năm ${year} còn lại`, value: balance ? formatNumber(balance.remaining) : '—' },
        ].map((s) => (
          <Col xs={12} md={8} xl={4} key={s.title}>
            <Card className="bm-stat-card"><Statistic title={s.title} value={s.value} /></Card>
          </Col>
        ))}
      </Row>
      {!!t?.missingCount && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={`Có ${t.missingCount} ngày thiếu giờ vào/ra hoặc chưa xếp ca — báo trưởng khoa/phòng để xác nhận.`}
        />
      )}
      <Card style={{ marginTop: 16 }} title="Chi tiết theo ngày" extra={<Link href="/leave/requests">Phiếu nghỉ của tôi</Link>}>
        <Table
          rowKey="id"
          size="small"
          dataSource={data?.rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Ngày', dataIndex: 'date', render: (d: string) => `${weekday(d)} ${formatDay(d)}` },
            { title: 'Ca', key: 's', render: (_, r) => r.shift?.code ?? '—' },
            { title: 'Giờ vào', dataIndex: 'firstIn', render: vnTime },
            { title: 'Giờ ra', dataIndex: 'lastOut', render: vnTime },
            { title: 'Ký hiệu', dataIndex: 'symbol', render: (v) => <b>{v}</b> },
            { title: 'Công', dataIndex: 'workUnits', render: (v) => formatNumber(v) },
            {
              title: 'Ghi chú',
              key: 'n',
              render: (_, r) => (
                <>
                  <Tag color={STATUS_COLOR[r.status]}>{TIMESHEET_STATUSES[r.status]}</Tag>
                  {r.isLate && <Tag color="orange">Muộn {r.lateMinutes}′</Tag>}
                  {r.isEarly && <Tag color="gold">Sớm {r.earlyMinutes}′</Tag>}
                  {r.overrideReason && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Điều chỉnh: {r.overrideReason}</Typography.Text>}
                </>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
