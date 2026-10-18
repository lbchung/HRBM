'use client';

import { BankOutlined, CalculatorOutlined, DeleteOutlined, FileExcelOutlined, LockOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Input, Progress, Row, Select, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { PayslipDrawer } from '@/components/Payslip';
import { api, downloadFile } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { money, monthLabel, RUN_STATUS, type PayrollRun } from '@/lib/payroll';
import { useCampuses, useUnits } from '@/lib/queries';

interface ItemRow {
  id: string;
  gross: string;
  deductions: string;
  net: string;
  errors: string[] | null;
  timesheetClosed: boolean;
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
}
interface SummaryRow { id: string; name: string; count: number; gross: string; deductions: string; net: string; employerCost: string }

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);
  const { data: run } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn: () => api<PayrollRun>(`/payroll/runs/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'CALCULATING' ? 2000 : false),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll-run', id] });
    qc.invalidateQueries({ queryKey: ['payroll-items', id] });
    qc.invalidateQueries({ queryKey: ['payroll-summary', id] });
    qc.invalidateQueries({ queryKey: ['payroll-runs'] });
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!run) return <Spin />;
  const calculating = run.status === 'CALCULATING';
  const closed = run.status === 'CLOSED';

  const calculate = () =>
    modal.confirm({
      title: run.status === 'CALCULATED' ? 'Tính lại bảng lương?' : 'Tính bảng lương?',
      content: 'Hệ thống lấy hồ sơ lương, công tháng, tiền trực, thu nhập tăng thêm, truy lĩnh để tính cho toàn bộ nhân viên. Kết quả lần tính trước (nếu có) sẽ được thay thế.',
      onOk: () => act(() => api(`/payroll/runs/${id}/calculate`, { method: 'POST' }), 'Đã đưa vào hàng đợi tính lương'),
    });
  const close = () =>
    modal.confirm({
      title: `Chốt ${run.name}?`,
      content: 'Sau khi chốt, bảng lương bị khóa — mọi điều chỉnh sẽ thực hiện qua truy lĩnh ở kỳ sau. Thu nhập tăng thêm và truy lĩnh trong kỳ được đánh dấu đã chi.',
      okText: 'Chốt bảng lương',
      okButtonProps: { danger: true },
      onOk: () => act(() => api(`/payroll/runs/${id}/close`, { method: 'POST' }), 'Đã chốt bảng lương'),
    });
  const remove = () =>
    modal.confirm({
      title: `Xóa ${run.code}?`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/payroll/runs/${id}`, { method: 'DELETE' });
          qc.invalidateQueries({ queryKey: ['payroll-runs'] });
          router.push('/payroll/runs');
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  return (
    <>
      <PageHeader
        title={`${run.name} (${run.code})`}
        extra={
          <>
            {!closed && can('payroll.run') && (
              <Button type="primary" icon={<CalculatorOutlined />} loading={busy || calculating} onClick={calculate}>
                {run.status === 'DRAFT' ? 'Tính lương' : 'Tính lại'}
              </Button>
            )}
            {run.status === 'CALCULATED' && can('payroll.close') && <Button danger icon={<LockOutlined />} onClick={close} loading={busy}>Chốt bảng lương</Button>}
            {(run.status === 'CALCULATED' || closed) && (
              <Button icon={<FileExcelOutlined />} onClick={() => downloadFile(`/payroll/runs/${id}/export`).catch((e) => message.error(errorMessage(e)))}>Xuất Excel</Button>
            )}
            {closed && can(['payroll.close']) && can('hr.sensitive.read') && (
              <Button icon={<BankOutlined />} onClick={() => downloadFile(`/payroll/runs/${id}/bank-export`).catch((e) => message.error(errorMessage(e)))}>Danh sách chuyển khoản</Button>
            )}
            {!closed && !calculating && can('payroll.run') && <Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>Xóa</Button>}
          </>
        }
      />
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={4}><Statistic title="Tháng" value={monthLabel(run.month)} /></Col>
          <Col xs={12} md={4}>
            <div className="ant-statistic-title" style={{ marginBottom: 4, color: 'var(--bm-text-secondary)' }}>Trạng thái</div>
            {calculating ? (
              <Progress percent={run.employeeCount ? Math.round((run.progress / run.employeeCount) * 100) : 0} />
            ) : (
              <Tag color={RUN_STATUS[run.status].color} style={{ fontSize: 14, padding: '2px 10px' }}>{RUN_STATUS[run.status].label}</Tag>
            )}
          </Col>
          <Col xs={12} md={4}><Statistic title="Số nhân viên" value={run.employeeCount} /></Col>
          <Col xs={12} md={4}><Statistic title="Tổng thu nhập" value={money(run.totals?.gross)} /></Col>
          <Col xs={12} md={4}><Statistic title="Tổng khấu trừ" value={money(run.totals?.deductions)} /></Col>
          <Col xs={12} md={4}><Statistic title="Thực lĩnh" value={money(run.totals?.net)} valueStyle={{ color: '#008046' }} /></Col>
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Tính lúc {formatDateTime(run.calculatedAt)}{run.closedAt ? ` · Chốt lúc ${formatDateTime(run.closedAt)}` : ''} · Đơn vị đóng BH, KPCĐ: {money(run.totals?.employerCost)}
        </Typography.Text>
        {run.errorCount > 0 && (
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message={`${run.errorCount} nhân viên có cảnh báo (thiếu diễn biến lương, lỗi công thức…) — lọc "Có cảnh báo" để rà soát trước khi chốt.`} />
        )}
      </Card>
      {run.status !== 'DRAFT' && (
        <Tabs
          items={[
            { key: 'items', label: 'Phiếu lương', children: <ItemsTab runId={id} /> },
            { key: 'summary', label: 'Tổng hợp đơn vị / cơ sở', children: <SummaryTab runId={id} /> },
          ]}
        />
      )}
    </>
  );
}

function ItemsTab({ runId }: { runId: string }) {
  const { data: units } = useUnits();
  const { data: campuses } = useCampuses();
  const [filters, setFilters] = useState<{ search?: string; unitId?: string; campusId?: string; hasErrors?: string }>({});
  const [page, setPage] = useState({ page: 1, pageSize: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['payroll-items', runId, filters, page],
    queryFn: () => api<Paginated<ItemRow>>(`/payroll/runs/${runId}/items`, { query: { ...filters, ...page } }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      <div className="bm-filters">
        <Input.Search placeholder="Tìm mã, tên nhân viên" allowClear onSearch={(v) => setFilters((f) => ({ ...f, search: v || undefined }))} style={{ width: 260 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Đơn vị" style={{ width: 240 }} options={units?.map((u) => ({ value: u.id, label: u.name }))} onChange={(v) => setFilters((f) => ({ ...f, unitId: v }))} />
        <Select allowClear placeholder="Cơ sở" options={campuses?.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setFilters((f) => ({ ...f, campusId: v }))} />
        <Select allowClear placeholder="Cảnh báo" options={[{ value: 'true', label: 'Có cảnh báo' }]} onChange={(v) => setFilters((f) => ({ ...f, hasErrors: v }))} />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.items}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, showSizeChanger: true, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
        columns={[
          { title: 'Mã NV', key: 'c', render: (_, r) => r.employee.code, width: 100 },
          { title: 'Họ tên', key: 'n', render: (_, r) => r.employee.fullName },
          { title: 'Đơn vị', key: 'u', render: (_, r) => r.employee.unit.name, responsive: ['lg'] },
          { title: 'Tổng thu nhập', dataIndex: 'gross', align: 'right', render: money },
          { title: 'Khấu trừ', dataIndex: 'deductions', align: 'right', render: money },
          { title: 'Thực lĩnh', dataIndex: 'net', align: 'right', render: (v: string) => <b>{money(v)}</b> },
          {
            title: 'Ghi chú',
            key: 'e',
            render: (_, r) => (
              <>
                {!r.timesheetClosed && <Tag>Công chưa chốt</Tag>}
                {r.errors?.some((e) => !e.includes('chưa chốt')) && <Tag color="warning">Cảnh báo</Tag>}
              </>
            ),
          },
        ]}
      />
      <PayslipDrawer id={openId} onClose={() => setOpenId(null)} showInfo />
    </Card>
  );
}

function SummaryTab({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['payroll-summary', runId], queryFn: () => api<{ byUnit: SummaryRow[]; byCampus: SummaryRow[] }>(`/payroll/runs/${runId}/summary`) });
  const columns = (first: string) => [
    { title: first, dataIndex: 'name' },
    { title: 'Số người', dataIndex: 'count', align: 'right' as const },
    { title: 'Tổng thu nhập', dataIndex: 'gross', align: 'right' as const, render: money },
    { title: 'Khấu trừ', dataIndex: 'deductions', align: 'right' as const, render: money },
    { title: 'Thực lĩnh', dataIndex: 'net', align: 'right' as const, render: money },
    { title: 'Đơn vị đóng', dataIndex: 'employerCost', align: 'right' as const, render: money },
  ];
  return (
    <Row gutter={16}>
      <Col xs={24} xl={9}>
        <Card title="Theo cơ sở (phân bổ theo công thực tế)" style={{ marginBottom: 16 }}>
          <Table rowKey="id" size="small" loading={isLoading} pagination={false} dataSource={data?.byCampus} columns={columns('Cơ sở')} scroll={{ x: 'max-content' }} />
        </Card>
      </Col>
      <Col xs={24} xl={15}>
        <Card title="Theo đơn vị">
          <Table rowKey="id" size="small" loading={isLoading} pagination={false} dataSource={data?.byUnit} columns={columns('Đơn vị')} scroll={{ x: 'max-content' }} />
        </Card>
      </Col>
    </Row>
  );
}
