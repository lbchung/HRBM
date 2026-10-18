'use client';

import { CopyOutlined, DownloadOutlined, ThunderboltOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, DatePicker, Form, Modal, Popover, Select, Space, Switch, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import type { ShiftType } from '@bachmai/shared';
import { api, downloadFile, uploadFile } from '@/lib/api';
import { useShifts, useUnitMonth, weekday, WEEKDAY_SHORT, type Shift } from '@/lib/attendance';
import { useCan } from '@/lib/auth';
import { errorMessage } from '@/lib/form';
import { PageHeader } from './PageHeader';
import { UnitMonthPicker } from './UnitMonthPicker';

interface GridEmployee {
  id: string;
  code: string;
  fullName: string;
  cells: Record<string, string[]>;
  leaves: { from: string; to: string; symbol: string; status: 'APPROVED' | 'PENDING' }[];
}
interface Grid {
  unit: { id: string; name: string; defaultShiftId: string | null };
  days: string[];
  holidays: { date: string; name: string }[];
  locked: boolean;
  employees: GridEmployee[];
}

/** Lưới xếp lịch tháng (lịch làm việc hoặc lịch trực). */
export function ScheduleGrid({ shiftType, title }: { shiftType: ShiftType; title: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const canEdit = can(shiftType === 'DUTY' ? 'duty.roster.manage' : 'attendance.schedule.manage');
  const { unitId, setUnitId, month, setMonth } = useUnitMonth();
  const { data: allShifts } = useShifts();
  const shifts = useMemo(() => (allShifts ?? []).filter((s) => s.type === shiftType), [allShifts, shiftType]);
  const shiftOf = useMemo(() => new Map((allShifts ?? []).map((s) => [s.id, s])), [allShifts]);
  const [selected, setSelected] = useState<string[]>([]);
  const [patternOpen, setPatternOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const key = ['schedules', unitId, month, shiftType];
  const { data, isFetching } = useQuery({
    queryKey: key,
    queryFn: () => api<Grid>('/attendance/schedules', { query: { unitId, month, shiftType } }),
    enabled: !!unitId,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['schedules'] });
  const holidayOf = new Map(data?.holidays.map((h) => [h.date, h.name]));
  const editable = canEdit && !data?.locked;

  const saveCell = async (employeeId: string, date: string, shiftIds: string[]) => {
    try {
      await api('/attendance/schedules/cells', { method: 'POST', body: { shiftType, cells: [{ employeeId, date, shiftIds }] } });
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const setDefault = async (shiftId: string | null) => {
    try {
      await api(`/attendance/units/${unitId}/default-shift`, { method: 'PUT', body: { shiftId } });
      message.success('Đã lưu ca mặc định của đơn vị');
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const columns: ColumnsType<GridEmployee> = [
    {
      title: 'Nhân viên',
      key: 'e',
      fixed: 'left',
      width: 200,
      render: (_, e) => (
        <div style={{ lineHeight: 1.2 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{e.fullName}</Typography.Text>
          <div style={{ fontSize: 11, color: 'var(--bm-text-secondary)' }}>{e.code}</div>
        </div>
      ),
    },
    ...(data?.days ?? []).map((d) => {
      const wd = dayjs(d).day();
      const holiday = holidayOf.get(d);
      const weekend = wd === 0 || wd === 6;
      return {
        title: (
          <Tooltip title={holiday}>
            <div style={{ textAlign: 'center', lineHeight: 1.1, color: holiday ? '#cf1322' : weekend ? '#d46b08' : undefined }}>
              <div style={{ fontWeight: 600 }}>{d.slice(8)}</div>
              <div style={{ fontSize: 10 }}>{weekday(d)}</div>
            </div>
          </Tooltip>
        ),
        key: d,
        width: 54,
        align: 'center' as const,
        onCell: () => ({ style: { padding: 2, background: holiday ? 'rgba(207,19,34,0.06)' : weekend ? 'rgba(212,107,8,0.05)' : undefined } }),
        render: (_: unknown, e: GridEmployee) => {
          const ids = e.cells[d] ?? [];
          const leave = e.leaves.find((l) => l.from <= d && l.to >= d);
          const content = (
            <div style={{ minHeight: 30, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', cursor: editable ? 'pointer' : 'default' }}>
              {ids.map((id) => {
                const s = shiftOf.get(id);
                return (
                  <span key={id} style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: s?.color ?? '#888', borderRadius: 4, padding: '0 4px', lineHeight: '16px' }}>
                    {s?.code ?? '?'}
                  </span>
                );
              })}
              {leave && (
                <Tag color={leave.status === 'APPROVED' ? 'blue' : 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 3, borderStyle: leave.status === 'PENDING' ? 'dashed' : 'solid' }}>
                  {leave.symbol}
                </Tag>
              )}
            </div>
          );
          if (!editable) return content;
          return <CellEditor shifts={shifts} value={ids} onSave={(v) => saveCell(e.id, d, v)}>{content}</CellEditor>;
        },
      };
    }),
    {
      title: 'Số ca',
      key: 'n',
      fixed: 'right',
      width: 64,
      align: 'center',
      render: (_, e) => Object.values(e.cells).reduce((s, x) => s + x.length, 0),
    },
  ];

  const exportXlsx = () => downloadFile('/attendance/schedules/export', { unitId, month, shiftType }).catch((e) => message.error(errorMessage(e)));
  const importXlsx = async (file: File) => {
    try {
      const r = await uploadFile<{ updated: number }>('/attendance/schedules/import', file, { unitId, month, shiftType });
      message.success(`Đã cập nhật ${r.updated} ô lịch`);
      refresh();
    } catch (e) {
      const err = e as { errors?: { file?: string[] }; message: string };
      Modal.error({ title: err.message, content: <div style={{ maxHeight: 300, overflow: 'auto' }}>{err.errors?.file?.map((x) => <div key={x}>• {x}</div>)}</div> });
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        extra={
          <>
            <Button icon={<DownloadOutlined />} onClick={exportXlsx} disabled={!unitId}>Xuất Excel</Button>
            {editable && (
              <Upload accept=".xlsx" showUploadList={false} customRequest={({ file }) => importXlsx(file as File)}>
                <Button icon={<UploadOutlined />}>Import Excel</Button>
              </Upload>
            )}
          </>
        }
      />
      <Card>
        <div className="bm-filters">
          <UnitMonthPicker unitId={unitId} onUnit={setUnitId} month={month} onMonth={setMonth} />
          {editable && (
            <>
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setPatternOpen(true)} disabled={!data?.employees.length}>
                Áp ca hàng loạt{selected.length ? ` (${selected.length} người)` : ''}
              </Button>
              <Button icon={<CopyOutlined />} onClick={() => setCopyOpen(true)} disabled={!data}>
                Sao chép tuần
              </Button>
            </>
          )}
          {shiftType === 'WORK' && data && can('attendance.schedule.manage') && (
            <Space>
              <Typography.Text type="secondary">Ca mặc định đơn vị:</Typography.Text>
              <Select
                allowClear
                placeholder="Chưa đặt"
                value={data.unit.defaultShiftId ?? undefined}
                onChange={(v) => setDefault(v ?? null)}
                style={{ width: 160 }}
                options={shifts.map((s) => ({ value: s.id, label: `${s.code} ${s.startTime}–${s.endTime}` }))}
              />
            </Space>
          )}
        </div>
        {data?.locked && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Công tháng này đã chốt — lịch chỉ xem, không sửa được" />}
        {!unitId && <Alert type="info" message="Chọn đơn vị để xem lịch" />}
        {unitId && (
          <Table
            rowKey="id"
            size="small"
            bordered
            columns={columns}
            dataSource={data?.employees}
            loading={isFetching}
            pagination={false}
            scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
            rowSelection={editable ? { selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]), fixed: true, columnWidth: 36 } : undefined}
          />
        )}
        <Space wrap style={{ marginTop: 12 }}>
          {shifts.map((s) => (
            <span key={s.id} style={{ fontSize: 12 }}>
              <span style={{ background: s.color ?? '#888', color: '#fff', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}>{s.code}</span> {s.name} ({s.startTime}–{s.endTime})
            </span>
          ))}
        </Space>
      </Card>
      {data && (
        <PatternModal
          open={patternOpen}
          onClose={() => setPatternOpen(false)}
          shifts={shifts}
          employees={data.employees}
          defaultEmployees={selected}
          defaultShiftId={data.unit.defaultShiftId ?? undefined}
          month={month}
          onDone={() => { setSelected([]); refresh(); }}
        />
      )}
      {data && unitId && <CopyWeekModal open={copyOpen} onClose={() => setCopyOpen(false)} unitId={unitId} month={month} shiftType={shiftType} onDone={refresh} />}
    </>
  );
}

function CellEditor({ shifts, value, onSave, children }: { shifts: Shift[]; value: string[]; onSave: (v: string[]) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<string[]>(value);
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o) setV(value); }}
      content={
        <div style={{ width: 220 }}>
          <Checkbox.Group value={v} onChange={(x) => setV(x as string[])} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shifts.map((s) => (
              <Checkbox key={s.id} value={s.id}>
                <b>{s.code}</b> {s.startTime}–{s.endTime}
              </Checkbox>
            ))}
          </Checkbox.Group>
          <Space style={{ marginTop: 8 }}>
            <Button size="small" type="primary" onClick={() => { onSave(v); setOpen(false); }}>Lưu</Button>
            <Button size="small" onClick={() => { onSave([]); setOpen(false); }} disabled={!value.length}>Xóa ca</Button>
          </Space>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

function PatternModal({
  open, onClose, shifts, employees, defaultEmployees, defaultShiftId, month, onDone,
}: {
  open: boolean; onClose: () => void; shifts: Shift[]; employees: GridEmployee[]; defaultEmployees: string[]; defaultShiftId?: string; month: string; onDone: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const submit = async (v: { employeeIds: string[]; shiftId: string; range: [Dayjs, Dayjs]; weekdays: number[]; replace: boolean }) => {
    setSaving(true);
    try {
      const r = await api<{ created: number }>('/attendance/schedules/pattern', {
        method: 'POST',
        body: { employeeIds: v.employeeIds, shiftId: v.shiftId, from: v.range[0].format('YYYY-MM-DD'), to: v.range[1].format('YYYY-MM-DD'), weekdays: v.weekdays, replace: v.replace },
      });
      message.success(`Đã xếp ${r.created} ca`);
      onDone();
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const start = dayjs(`${month}-01`);
  return (
    <Modal open={open} title="Áp ca hàng loạt" onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Áp dụng" width={620} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{
          employeeIds: defaultEmployees.length ? defaultEmployees : employees.map((e) => e.id),
          shiftId: shifts.some((s) => s.id === defaultShiftId) ? defaultShiftId : shifts[0]?.id,
          range: [start, start.endOf('month')],
          weekdays: [1, 2, 3, 4, 5],
          replace: true,
        }}
      >
        <Form.Item name="employeeIds" label="Nhân viên" rules={[{ required: true }]}>
          <Select mode="multiple" maxTagCount={6} optionFilterProp="label" options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullName}` }))} />
        </Form.Item>
        <Form.Item name="shiftId" label="Ca" rules={[{ required: true }]}>
          <Select options={shifts.map((s) => ({ value: s.id, label: `${s.code} — ${s.name} (${s.startTime}–${s.endTime})` }))} />
        </Form.Item>
        <Form.Item name="range" label="Khoảng ngày" rules={[{ required: true }]}>
          <DatePicker.RangePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="weekdays" label="Các thứ trong tuần" rules={[{ required: true }]}>
          <Checkbox.Group options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: WEEKDAY_SHORT[d] }))} />
        </Form.Item>
        <Form.Item name="replace" label="Thay thế ca cùng loại đã xếp" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function CopyWeekModal({ open, onClose, unitId, month, shiftType, onDone }: { open: boolean; onClose: () => void; unitId: string; month: string; shiftType: ShiftType; onDone: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const submit = async (v: { source: Dayjs; targets: Dayjs[] }) => {
    setSaving(true);
    try {
      const monday = (d: Dayjs) => d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD');
      const r = await api<{ created: number }>('/attendance/schedules/copy-week', {
        method: 'POST',
        body: { unitId, shiftType, sourceWeekStart: monday(v.source), targetWeekStarts: v.targets.map(monday) },
      });
      message.success(`Đã sao chép ${r.created} ca`);
      onDone();
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title="Sao chép lịch tuần" onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText="Sao chép" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ source: dayjs(`${month}-01`) }}>
        <Form.Item name="source" label="Tuần nguồn (chọn một ngày bất kỳ trong tuần)" rules={[{ required: true }]}>
          <DatePicker picker="week" format="[Tuần] w/YYYY" />
        </Form.Item>
        <Form.Item name="targets" label="Sao chép sang các tuần" rules={[{ required: true, message: 'Chọn tuần đích' }]} extra="Lịch cùng loại ở tuần đích sẽ bị thay thế">
          <DatePicker picker="week" multiple format="[Tuần] w/YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
