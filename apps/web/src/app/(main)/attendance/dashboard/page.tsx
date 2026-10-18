'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Row, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { vnTime } from '@/lib/attendance';
import { useCampusFilter } from '@/lib/campus-filter';
import { formatDateTime } from '@/lib/format';

interface Dashboard {
  date: string;
  stat: { scheduled: number; present: number; late: number; onLeave: number; notYet: number; absent: number };
  late: { employeeId: string; shiftCode: string; firstIn: string; lateMinutes: number; employee?: { code: string; fullName: string; unit: { name: string } } }[];
  devices: { id: string; code: string; name: string; campus: string; health: 'ONLINE' | 'OFFLINE' | 'NEVER' | 'DISABLED'; lastSuccessAt: string | null; lastError: string | null; clockOffsetSeconds: number | null }[];
  unmappedPunches: number;
  pendingLeaves: number;
  punchesByHour: { total: number; hours: number[] };
}

const HEALTH = { ONLINE: ['green', 'Đang kết nối'], OFFLINE: ['red', 'Mất kết nối'], NEVER: ['orange', 'Chưa đồng bộ'], DISABLED: ['default', 'Ngừng dùng'] } as const;

export default function AttendanceDashboard() {
  const { campusId } = useCampusFilter();
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-dashboard', campusId],
    queryFn: () => api<Dashboard>('/attendance/dashboard', { query: { campusId } }),
    refetchInterval: 60_000,
  });
  const s = data?.stat;
  const pct = (n?: number) => (s?.scheduled ? Math.round(((n ?? 0) / s.scheduled) * 100) : 0);
  const maxHour = Math.max(1, ...(data?.punchesByHour.hours ?? [0]));
  const down = data?.devices.filter((d) => d.health === 'OFFLINE' || d.health === 'NEVER') ?? [];

  const tiles = [
    { title: 'Có lịch hôm nay', value: s?.scheduled, color: undefined },
    { title: 'Đã chấm công', value: s?.present, suffix: s ? `(${pct(s.present)}%)` : '', color: '#008046' },
    { title: 'Đi muộn', value: s?.late, color: '#d46b08' },
    { title: 'Nghỉ có phiếu', value: s?.onLeave, color: '#1677ff' },
    { title: 'Chưa đến giờ ca', value: s?.notYet, color: undefined },
    { title: 'Chưa chấm công (đã vào ca)', value: s?.absent, color: '#cf1322' },
  ];

  return (
    <>
      <PageHeader title={`Dashboard chấm công — ${data ? dayjs(data.date).format('dddd, DD/MM/YYYY') : ''}`} />
      {down.length > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={`${down.length} máy chấm công không đồng bộ được: ${down.map((d) => d.name).join(', ')}`} action={<Link href="/attendance/devices">Xem máy</Link>} />
      )}
      <Row gutter={[16, 16]}>
        {tiles.map((t) => (
          <Col xs={12} md={8} xl={4} key={t.title}>
            <Card className="bm-stat-card">
              <Statistic title={t.title} value={t.value ?? 0} loading={isLoading} valueStyle={{ color: t.color }} suffix={<span style={{ fontSize: 13 }}>{t.suffix}</span>} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title={`Lượt quét theo giờ hôm nay (${data?.punchesByHour.total ?? 0} lượt)`}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 160 }} role="img" aria-label="Biểu đồ lượt quét theo giờ">
              {(data?.punchesByHour.hours ?? Array(24).fill(0)).map((n, h) => (
                <Tooltip key={h} title={`${String(h).padStart(2, '0')}:00 – ${n} lượt`}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ width: '100%', height: `${(n / maxHour) * 130}px`, minHeight: n ? 2 : 0, background: 'var(--bm-primary)', borderRadius: '3px 3px 0 0' }} />
                    <span style={{ fontSize: 9, color: 'var(--bm-text-secondary)', marginTop: 2 }}>{h % 3 === 0 ? h : ''}</span>
                  </div>
                </Tooltip>
              ))}
            </div>
          </Card>
          <Card title="Đi muộn hôm nay" style={{ marginTop: 16 }} extra={<Link href="/attendance/late-early">Báo cáo đầy đủ</Link>}>
            <Table
              size="small"
              rowKey="employeeId"
              pagination={false}
              dataSource={data?.late}
              locale={{ emptyText: 'Chưa có ai đi muộn' }}
              columns={[
                { title: 'Nhân viên', key: 'e', render: (_, l) => <>{l.employee?.fullName} <Typography.Text type="secondary">({l.employee?.code})</Typography.Text></> },
                { title: 'Đơn vị', key: 'u', render: (_, l) => l.employee?.unit.name, responsive: ['md'] },
                { title: 'Ca', dataIndex: 'shiftCode' },
                { title: 'Giờ vào', dataIndex: 'firstIn', render: vnTime },
                { title: 'Muộn', dataIndex: 'lateMinutes', render: (v) => <Tag color="orange">{v} phút</Tag> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Máy chấm công">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data?.devices}
              columns={[
                { title: 'Máy', key: 'n', render: (_, d) => <>{d.name}<div style={{ fontSize: 11, color: 'var(--bm-text-secondary)' }}>{d.campus}</div></> },
                { title: 'Tình trạng', dataIndex: 'health', render: (h: keyof typeof HEALTH) => <Tag color={HEALTH[h][0]}>{HEALTH[h][1]}</Tag> },
                { title: 'Đồng bộ', dataIndex: 'lastSuccessAt', render: (v) => <span style={{ fontSize: 12 }}>{formatDateTime(v)}</span> },
              ]}
            />
          </Card>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card>
                <Link href="/attendance/punches"><Statistic title="Lượt quét chưa gắn nhân viên" value={data?.unmappedPunches ?? 0} valueStyle={{ color: data?.unmappedPunches ? '#d46b08' : undefined }} /></Link>
              </Card>
            </Col>
            <Col span={12}>
              <Card>
                <Link href="/leave/requests"><Statistic title="Phiếu nghỉ chờ duyệt" value={data?.pendingLeaves ?? 0} /></Link>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
    </>
  );
}
