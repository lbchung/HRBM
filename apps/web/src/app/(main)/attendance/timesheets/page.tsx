'use client';

import { CheckCircleOutlined, DownloadOutlined, LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Space, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PERIOD_STATUSES, TIMESHEET_STATUSES, type MonthTotals, type PeriodStatus, type TimesheetStatus } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { UnitMonthPicker } from '@/components/UnitMonthPicker';
import { api, downloadFile } from '@/lib/api';
import { CELL_BG, STATUS_COLOR, useUnitMonth, vnTime, weekday } from '@/lib/attendance';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDateTime, formatNumber } from '@/lib/format';

interface Cell {
  id: string;
  date: string;
  shiftCode: string | null;
  status: TimesheetStatus;
  symbol: string;
  workUnits: string;
  computedSymbol: string;
  overridden: boolean;
  isLate: boolean;
  isEarly: boolean;
  campusMismatch: boolean;
}
interface Row {
  id: string;
  code: string;
  fullName: string;
  cells: Cell[];
  totals: MonthTotals;
}
interface Grid {
  month: string;
  days: string[];
  holidays: { date: string; name: string }[];
  campuses: { id: string; code: string; name: string }[];
  period: { status: PeriodStatus; confirmedAt?: string | null; closedAt?: string | null; note?: string | null };
  employees: Row[];
}

const PERIOD_COLOR: Record<PeriodStatus, string> = { OPEN: 'default', CONFIRMED: 'blue', CLOSED: 'green' };

export default function TimesheetsPage() {
  const can = useCan();
  return (
    <Tabs
      destroyOnHidden
      items={[
        { key: 'unit', label: 'Bảng công đơn vị', children: <UnitTimesheet /> },
        ...(can('attendance.timesheet.close') ? [{ key: 'periods', label: 'Kỳ công các đơn vị', children: <Periods /> }] : []),
      ]}
    />
  );
}

function UnitTimesheet() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const { unitId, setUnitId, month, setMonth } = useUnitMonth();
  const [rowId, setRowId] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const key = ['timesheets', unitId, month];
  const { data, isFetching } = useQuery({ queryKey: key, queryFn: () => api<Grid>('/attendance/timesheets', { query: { unitId, month } }), enabled: !!unitId });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['timesheets'] });
  const status = data?.period.status ?? 'OPEN';
  const holidays = new Map(data?.holidays.map((h) => [h.date, h.name]));

  const recompute = async () => {
    setRecomputing(true);
    try {
      const r = await api<{ employees: number; jobIds: string[] }>('/attendance/timesheets/recompute', { method: 'POST', body: { unitId, month } });
      // Chờ các tác vụ tính công hoàn tất
      for (let i = 0; i < 60; i++) {
        const states = await Promise.all(r.jobIds.map((id) => api<{ state: string }>(`/attendance/jobs/${id}`)));
        if (states.every((s) => s.state === 'completed' || s.state === 'failed')) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      message.success(`Đã tính lại công cho ${r.employees} nhân viên`);
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setRecomputing(false);
    }
  };

  const action = (op: 'confirm' | 'close' | 'reopen') => {
    const titles = { confirm: 'Xác nhận công tháng của đơn vị', close: 'Chốt công tháng (khóa dữ liệu)', reopen: 'Mở lại kỳ công đã chốt' };
    let note = '';
    modal.confirm({
      title: titles[op],
      content: (
        <>
          {op === 'close' && <p>Sau khi chốt, không thể điều chỉnh công hoặc sửa lịch tháng này. Số liệu tổng hợp được dùng để tính lương.</p>}
          {op === 'reopen' && <p>Chỉ mở lại khi cần sửa sai. Thao tác được ghi nhật ký.</p>}
          <Input.TextArea rows={2} placeholder={op === 'reopen' ? 'Lý do mở lại (bắt buộc)' : 'Ghi chú'} onChange={(e) => (note = e.target.value)} />
        </>
      ),
      okButtonProps: { danger: op !== 'confirm' },
      onOk: async () => {
        try {
          await api(`/attendance/periods/${op}`, { method: 'POST', body: { unitIds: [unitId], month, note } });
          message.success('Đã cập nhật kỳ công');
          refresh();
        } catch (e) {
          message.error(errorMessage(e));
          throw e;
        }
      },
    });
  };

  const campusCols = data?.campuses ?? [];
  const columns: ColumnsType<Row> = [
    {
      title: 'Nhân viên',
      key: 'e',
      fixed: 'left',
      width: 190,
      render: (_, e) => (
        <div style={{ lineHeight: 1.2 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{e.fullName}</Typography.Text>
          <div style={{ fontSize: 11, color: 'var(--bm-text-secondary)' }}>{e.code}</div>
        </div>
      ),
    },
    ...(data?.days ?? []).map((d) => {
      const wd = dayjs(d).day();
      return {
        title: (
          <Tooltip title={holidays.get(d)}>
            <div style={{ textAlign: 'center', lineHeight: 1.1, color: holidays.has(d) ? '#cf1322' : wd === 0 || wd === 6 ? '#d46b08' : undefined }}>
              <div style={{ fontWeight: 600 }}>{d.slice(8)}</div>
              <div style={{ fontSize: 10 }}>{weekday(d)}</div>
            </div>
          </Tooltip>
        ),
        key: d,
        width: 44,
        align: 'center' as const,
        onCell: () => ({ style: { padding: 1 } }),
        render: (_: unknown, e: Row) => {
          const cells = e.cells.filter((c) => c.date === d);
          if (!cells.length) return null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {cells.map((c) => (
                <Tooltip
                  key={c.id}
                  title={`${c.shiftCode ?? 'Không xếp ca'} · ${TIMESHEET_STATUSES[c.status]}${c.isLate ? ' · đi muộn' : ''}${c.isEarly ? ' · về sớm' : ''}${c.campusMismatch ? ' · khác cơ sở phân công' : ''}${c.overridden ? ` · đã điều chỉnh (gốc: ${c.computedSymbol})` : ''}`}
                >
                  <div
                    onClick={() => setRowId(c.id)}
                    style={{
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 4,
                      background: c.overridden ? 'rgba(0,128,70,0.15)' : CELL_BG[c.status],
                      outline: c.isLate || c.isEarly ? '1px solid #fa8c16' : c.campusMismatch ? '1px dashed #722ed1' : undefined,
                      lineHeight: '20px',
                    }}
                  >
                    {c.symbol}
                  </div>
                </Tooltip>
              ))}
            </div>
          );
        },
      };
    }),
    { title: 'Công', key: 'u', fixed: 'right', width: 60, align: 'right', render: (_, e) => <b>{formatNumber(e.totals.workUnits, 2)}</b> },
    ...campusCols.map((c) => ({
      title: c.code,
      key: `c-${c.id}`,
      width: 50,
      align: 'right' as const,
      render: (_: unknown, e: Row) => (e.totals.unitsByCampus[c.id] ? formatNumber(e.totals.unitsByCampus[c.id], 2) : ''),
    })),
    { title: 'Trực', key: 'd', width: 46, align: 'right', render: (_, e) => e.totals.dutyCount || '' },
    { title: 'Muộn', key: 'l', width: 50, align: 'right', render: (_, e) => (e.totals.lateCount ? <Typography.Text type="warning">{e.totals.lateCount}</Typography.Text> : '') },
    { title: 'Vắng', key: 'a', width: 46, align: 'right', render: (_, e) => (e.totals.absentCount ? <Typography.Text type="danger">{e.totals.absentCount}</Typography.Text> : '') },
    { title: 'Chưa rõ', key: 'm', width: 58, align: 'right', render: (_, e) => (e.totals.missingCount ? <Tag color="orange" style={{ margin: 0 }}>{e.totals.missingCount}</Tag> : '') },
  ];

  const pending = data?.employees.reduce((s, e) => s + e.totals.missingCount, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Bảng công tháng"
        extra={
          <Button icon={<DownloadOutlined />} disabled={!data} onClick={() => downloadFile('/attendance/timesheets', { unitId, month, export: 'xlsx' }).catch((e) => message.error(errorMessage(e)))}>
            Xuất Excel
          </Button>
        }
      />
      <Card>
        <div className="bm-filters">
          <UnitMonthPicker unitId={unitId} onUnit={setUnitId} month={month} onMonth={setMonth} />
          {data && <Tag color={PERIOD_COLOR[status]} style={{ alignSelf: 'center' }}>{PERIOD_STATUSES[status]}</Tag>}
          {data && status !== 'CLOSED' && can(['attendance.timesheet.adjust', 'attendance.timesheet.close']) && (
            <Button icon={<ReloadOutlined />} loading={recomputing} onClick={recompute}>Tính lại công</Button>
          )}
          {data && status === 'OPEN' && can('attendance.timesheet.confirm') && (
            <Button icon={<CheckCircleOutlined />} onClick={() => action('confirm')}>Xác nhận công</Button>
          )}
          {data && status !== 'CLOSED' && can('attendance.timesheet.close') && (
            <Button type="primary" icon={<LockOutlined />} onClick={() => action('close')}>Chốt công</Button>
          )}
          {data && status === 'CLOSED' && can('attendance.timesheet.close') && (
            <Button danger icon={<UnlockOutlined />} onClick={() => action('reopen')}>Mở lại</Button>
          )}
        </div>
        {pending > 0 && status !== 'CLOSED' && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${pending} ô công chưa rõ (thiếu giờ vào/ra, chấm công chưa xếp ca) — bấm vào ô để kiểm tra và điều chỉnh trước khi xác nhận`} />
        )}
        {!unitId && <Alert type="info" message="Chọn đơn vị để xem bảng công" />}
        {unitId && (
          <Table
            rowKey="id"
            size="small"
            bordered
            columns={columns}
            dataSource={data?.employees}
            loading={isFetching}
            pagination={false}
            scroll={{ x: 'max-content', y: 'calc(100vh - 360px)' }}
          />
        )}
        <Space wrap style={{ marginTop: 12, fontSize: 12 }}>
          <span><b>X</b> đi làm</span>
          <span><b>T</b> trực</span>
          <span><b>K</b> vắng không phiếu</span>
          <span><b>?</b> thiếu giờ vào/ra</span>
          <span><b>L</b> lễ</span>
          <span>Ký hiệu nghỉ theo loại phiếu (P, Ô, CT, H…)</span>
          <span style={{ outline: '1px solid #fa8c16', padding: '0 4px' }}>đi muộn / về sớm</span>
          <span style={{ outline: '1px dashed #722ed1', padding: '0 4px' }}>khác cơ sở phân công</span>
          <span style={{ background: 'rgba(0,128,70,0.15)', padding: '0 4px' }}>đã điều chỉnh</span>
        </Space>
      </Card>
      <RowDrawer id={rowId} onClose={() => setRowId(null)} locked={status === 'CLOSED'} onSaved={refresh} />
    </>
  );
}

interface RowDetail {
  id: string;
  date: string;
  status: TimesheetStatus;
  symbol: string;
  workUnits: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  isLate: boolean;
  isEarly: boolean;
  campusMismatch: boolean;
  overrideSymbol: string | null;
  overrideWorkUnits: string | null;
  overrideReason: string | null;
  overriddenAt: string | null;
  computedAt: string;
  punches: { id: string; punchTime: string; device: { name: string; campus: { name: string } } }[];
}

function RowDrawer({ id, onClose, locked, onSaved }: { id: string | null; onClose: () => void; locked: boolean; onSaved: () => void }) {
  const { message } = App.useApp();
  const can = useCan();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { data: r, isLoading } = useQuery({ queryKey: ['timesheet-row', id], queryFn: () => api<RowDetail>(`/attendance/timesheets/rows/${id}`), enabled: !!id });

  const save = async (v: { symbol?: string; workUnits?: string; reason: string }, clear = false) => {
    try {
      await api(`/attendance/timesheets/rows/${id}`, {
        method: 'PATCH',
        body: clear ? { symbol: null, workUnits: null, reason: v.reason || 'Gỡ điều chỉnh' } : { symbol: v.symbol || null, workUnits: v.workUnits ?? null, reason: v.reason },
      });
      message.success(clear ? 'Đã gỡ điều chỉnh' : 'Đã điều chỉnh công');
      queryClient.invalidateQueries({ queryKey: ['timesheet-row', id] });
      onSaved();
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    }
  };

  const canAdjust = can('attendance.timesheet.adjust') && !locked;
  return (
    <Drawer open={!!id} onClose={onClose} width={520} title={r ? `Công ngày ${dayjs(r.date.slice(0, 10)).format('DD/MM/YYYY')}` : 'Chi tiết công'} destroyOnHidden>
      {isLoading || !r ? (
        <Spin />
      ) : (
        <>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLOR[r.status]}>{TIMESHEET_STATUSES[r.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="Ca">{r.scheduledStart ? `${vnTime(r.scheduledStart)} – ${vnTime(r.scheduledEnd)}` : 'Không xếp ca'}</Descriptions.Item>
            <Descriptions.Item label="Giờ vào / ra">{vnTime(r.firstIn)} / {vnTime(r.lastOut)}</Descriptions.Item>
            <Descriptions.Item label="Thời gian làm">{r.workedMinutes ? `${Math.floor(r.workedMinutes / 60)} giờ ${r.workedMinutes % 60} phút` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Đi muộn / về sớm">
              {r.isLate ? <Tag color="orange">Muộn {r.lateMinutes} phút</Tag> : null}
              {r.isEarly ? <Tag color="orange">Sớm {r.earlyMinutes} phút</Tag> : null}
              {!r.isLate && !r.isEarly && '—'}
            </Descriptions.Item>
            {r.campusMismatch && <Descriptions.Item label="Cơ sở"><Tag color="purple">Chấm công khác cơ sở được phân công</Tag></Descriptions.Item>}
            <Descriptions.Item label="Kết quả tự động">{r.symbol} · {formatNumber(r.workUnits)} công</Descriptions.Item>
            {(r.overrideSymbol !== null || r.overrideWorkUnits !== null) && (
              <Descriptions.Item label="Đã điều chỉnh">
                <b>{r.overrideSymbol ?? r.symbol}</b> · {formatNumber(r.overrideWorkUnits ?? r.workUnits)} công
                <div style={{ fontSize: 12, color: 'var(--bm-text-secondary)' }}>{r.overrideReason} · {formatDateTime(r.overriddenAt)}</div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Tính lúc">{formatDateTime(r.computedAt)}</Descriptions.Item>
          </Descriptions>
          <Typography.Title level={5} style={{ marginTop: 16 }}>Lượt quét quanh ngày</Typography.Title>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={r.punches}
            locale={{ emptyText: 'Không có lượt quét' }}
            columns={[
              { title: 'Thời gian', dataIndex: 'punchTime', render: (v) => dayjs(v).format('DD/MM HH:mm:ss') },
              { title: 'Máy', key: 'd', render: (_, p) => `${p.device.name} (${p.device.campus.name})` },
            ]}
          />
          {canAdjust && (
            <Card size="small" title="Điều chỉnh công" style={{ marginTop: 16 }}>
              <Form
                form={form}
                layout="vertical"
                onFinish={(v) => save(v)}
                initialValues={{ symbol: r.overrideSymbol ?? r.symbol, workUnits: r.overrideWorkUnits ?? r.workUnits }}
                key={r.id}
              >
                <Space align="start">
                  <Form.Item name="symbol" label="Ký hiệu" rules={[{ required: true }]}>
                    <Input style={{ width: 90 }} maxLength={10} />
                  </Form.Item>
                  <Form.Item name="workUnits" label="Số công" rules={[{ required: true }]}>
                    <InputNumber<string> stringMode min="0" step="0.5" decimalSeparator="," style={{ width: 110 }} />
                  </Form.Item>
                </Space>
                <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Nhập lý do điều chỉnh' }]}>
                  <Input.TextArea rows={2} placeholder="vd: Quên quét giờ ra, trưởng khoa xác nhận" />
                </Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">Lưu điều chỉnh</Button>
                  {(r.overrideSymbol !== null || r.overrideWorkUnits !== null) && (
                    <Button onClick={() => save({ reason: 'Gỡ điều chỉnh' }, true)}>Gỡ điều chỉnh</Button>
                  )}
                </Space>
              </Form>
            </Card>
          )}
        </>
      )}
    </Drawer>
  );
}

interface PeriodRow {
  unit: { id: string; code: string; name: string };
  status: PeriodStatus;
  confirmedAt: string | null;
  closedAt: string | null;
  rows: number;
  pending: number;
  absent: number;
}

function Periods() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [selected, setSelected] = useState<string[]>([]);
  const { data, isFetching } = useQuery({ queryKey: ['periods', month], queryFn: () => api<PeriodRow[]>('/attendance/periods', { query: { month } }) });

  const closeSelected = () =>
    modal.confirm({
      title: `Chốt công tháng ${dayjs(`${month}-01`).format('MM/YYYY')} cho ${selected.length} đơn vị?`,
      content: 'Dữ liệu công sẽ bị khóa và được dùng để tính lương.',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api('/attendance/periods/close', { method: 'POST', body: { unitIds: selected, month } });
          message.success('Đã chốt công');
          setSelected([]);
          queryClient.invalidateQueries({ queryKey: ['periods'] });
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  return (
    <>
      <PageHeader title="Kỳ công các đơn vị" />
      <Card>
        <div className="bm-filters">
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(d) => d && setMonth(d.format('YYYY-MM'))} />
          <Button type="primary" icon={<LockOutlined />} disabled={!selected.length} onClick={closeSelected}>
            Chốt công các đơn vị đã chọn
          </Button>
        </div>
        <Table
          rowKey={(r) => r.unit.id}
          size="middle"
          loading={isFetching}
          dataSource={data}
          pagination={false}
          rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]), getCheckboxProps: (r) => ({ disabled: r.status === 'CLOSED' }) }}
          columns={[
            { title: 'Đơn vị', key: 'u', render: (_, r) => r.unit.name },
            { title: 'Trạng thái', dataIndex: 'status', render: (s: PeriodStatus) => <Tag color={PERIOD_COLOR[s]}>{PERIOD_STATUSES[s]}</Tag> },
            { title: 'Xác nhận lúc', dataIndex: 'confirmedAt', render: formatDateTime },
            { title: 'Chốt lúc', dataIndex: 'closedAt', render: formatDateTime },
            { title: 'Số ô công', dataIndex: 'rows', align: 'right' },
            { title: 'Chưa rõ', dataIndex: 'pending', align: 'right', render: (v) => (v ? <Tag color="orange">{v}</Tag> : 0) },
            { title: 'Vắng', dataIndex: 'absent', align: 'right' },
          ]}
        />
      </Card>
    </>
  );
}
