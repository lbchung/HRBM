'use client';

import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, Modal, Row, Select, Space, Spin, Steps, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { HALF_DAYS, LEAVE_STATUSES, type LeaveStatus, type Paginated } from '@bachmai/shared';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { api, fileUrl } from '@/lib/api';
import { useLeaveTypes } from '@/lib/attendance';
import { useCan } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDateTime, formatDay } from '@/lib/format';

interface LeaveRow {
  id: string;
  code: string;
  fromDate: string;
  toDate: string;
  startSession: 'AM' | 'PM';
  endSession: 'AM' | 'PM';
  days: string;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  employee: { id: string; code: string; fullName: string; unit: { name: string } };
  leaveType: { code: string; name: string; symbol: string };
}

const STATUS_COLOR: Record<LeaveStatus, string> = { PENDING: 'processing', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'default' };
const ACTION_LABEL: Record<string, string> = { SUBMIT: 'Gửi phiếu', APPROVE: 'Duyệt', REJECT: 'Từ chối', CANCEL: 'Hủy' };

const period = (r: Pick<LeaveRow, 'fromDate' | 'toDate' | 'startSession' | 'endSession'>) => {
  const s = r.startSession === 'PM' ? ' (chiều)' : '';
  const e = r.endSession === 'AM' ? ' (sáng)' : '';
  return r.fromDate.slice(0, 10) === r.toDate.slice(0, 10)
    ? `${formatDay(r.fromDate)}${r.startSession === r.endSession ? ` (${HALF_DAYS[r.startSession].toLowerCase()})` : ''}`
    : `${formatDay(r.fromDate)}${s} – ${formatDay(r.toDate)}${e}`;
};

export default function LeaveRequestsPage() {
  const can = useCan();
  const manager = can(['leave.request.create', 'leave.request.approve']);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Phiếu nghỉ, công tác, học tập"
        extra={can(['leave.request.create', 'self.leave.create']) && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Tạo phiếu</Button>}
      />
      <Tabs
        destroyOnHidden
        items={[
          ...(manager ? [{ key: 'all', label: 'Phiếu trong đơn vị', children: <LeaveList onOpen={setOpenId} /> }] : []),
          { key: 'mine', label: 'Phiếu của tôi / tôi tạo', children: <LeaveList mine onOpen={setOpenId} /> },
        ]}
      />
      <CreateLeaveModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpenId(id)} />
      <LeaveDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function LeaveList({ mine, onOpen }: { mine?: boolean; onOpen: (id: string) => void }) {
  const { data: types } = useLeaveTypes(true);
  const [filters, setFilters] = useState<{ status?: string; leaveTypeId?: string; search?: string }>({});
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const { data, isFetching } = useQuery({
    queryKey: ['leave-requests', mine, filters, page],
    queryFn: () => api<Paginated<LeaveRow>>('/leave/requests', { query: { ...filters, ...page, mine } }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      <div className="bm-filters">
        <Input.Search placeholder="Tìm số phiếu, mã, tên nhân viên" allowClear onSearch={(v) => setFilters((f) => ({ ...f, search: v || undefined }))} style={{ width: 280 }} />
        <Select allowClear placeholder="Trạng thái" options={Object.entries(LEAVE_STATUSES).map(([value, label]) => ({ value, label }))} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} />
        <Select allowClear placeholder="Loại phiếu" options={types?.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setFilters((f) => ({ ...f, leaveTypeId: v }))} style={{ width: 220 }} />
      </div>
      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data?.items}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
        columns={[
          { title: 'Số phiếu', dataIndex: 'code', width: 150 },
          { title: 'Nhân viên', key: 'e', render: (_, r) => <>{r.employee.fullName} <Typography.Text type="secondary">({r.employee.code})</Typography.Text></> },
          { title: 'Đơn vị', key: 'u', render: (_, r) => r.employee.unit.name, responsive: ['lg'] },
          { title: 'Loại', key: 't', render: (_, r) => <><Tag>{r.leaveType.symbol}</Tag>{r.leaveType.name}</> },
          { title: 'Thời gian', key: 'p', render: (_, r) => period(r) },
          { title: 'Số ngày', dataIndex: 'days', align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', render: (s: LeaveStatus) => <Tag color={STATUS_COLOR[s]}>{LEAVE_STATUSES[s]}</Tag> },
          { title: 'Ngày tạo', dataIndex: 'createdAt', render: formatDateTime, responsive: ['xl'] },
        ]}
      />
    </Card>
  );
}

interface WorkflowStep { stepOrder: number; name: string; approverType: string }
interface EmployeeOption { id: string; code: string; fullName: string; unit: { name: string } }

function CreateLeaveModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const { data: types } = useLeaveTypes();
  const [empSearch, setEmpSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const canOthers = can('leave.request.create');

  const { data: self } = useQuery({ queryKey: ['employee', 'me'], queryFn: () => api<EmployeeOption | null>('/hr/employees/me'), enabled: open });
  const { data: employees } = useQuery({
    queryKey: ['employees', 'pick', empSearch],
    queryFn: () => api<Paginated<EmployeeOption>>('/hr/employees', { query: { search: empSearch, pageSize: 30 } }),
    enabled: open && canOthers,
  });
  const { data: workflows } = useQuery({
    queryKey: ['approval-workflows', 'LEAVE_REQUEST'],
    queryFn: () => api<{ code: string; steps: WorkflowStep[] }[]>('/approval-workflows', { query: { targetType: 'LEAVE_REQUEST' } }),
    enabled: open,
  });
  const { data: users } = useQuery({
    queryKey: ['users', 'lookup', userSearch],
    queryFn: () => api<{ id: string; fullName: string; username: string; unit: { name: string } | null }[]>('/users/lookup', { query: { search: userSearch } }),
    enabled: open,
  });

  const leaveTypeId = Form.useWatch('leaveTypeId', form);
  const range = Form.useWatch('range', form) as [Dayjs, Dayjs] | undefined;
  const startSession = Form.useWatch('startSession', form);
  const endSession = Form.useWatch('endSession', form);
  const type = types?.find((t) => t.id === leaveTypeId);
  const steps = workflows?.find((w) => w.code === type?.workflowCode)?.steps ?? [];

  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    if (!range?.[0] || !range[1]) return setDays(null);
    api<{ days: number }>('/leave/days', { query: { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), startSession: startSession ?? 'AM', endSession: endSession ?? 'PM' } })
      .then((r) => setDays(r.days))
      .catch(() => setDays(null));
  }, [range, startSession, endSession]);

  useEffect(() => {
    if (open && !canOthers && self) form.setFieldValue('employeeId', self.id);
  }, [open, canOthers, self, form]);

  const submit = async (v: Record<string, unknown>) => {
    setSaving(true);
    const [from, to] = v.range as [Dayjs, Dayjs];
    const selectedApprovers = Object.fromEntries(steps.filter((s) => s.approverType === 'SELECTED').map((s) => [String(s.stepOrder), (v[`step_${s.stepOrder}`] as string[]) ?? []]));
    try {
      const r = await api<{ id: string; code: string }>('/leave/requests', {
        method: 'POST',
        body: {
          employeeId: v.employeeId,
          leaveTypeId: v.leaveTypeId,
          fromDate: from.format('YYYY-MM-DD'),
          toDate: to.format('YYYY-MM-DD'),
          startSession: v.startSession,
          endSession: v.endSession,
          reason: v.reason,
          destination: v.destination ?? '',
          fileId: v.fileId ?? null,
          selectedApprovers,
        },
      });
      message.success(`Đã gửi phiếu ${r.code}`);
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      form.resetFields();
      onClose();
      onCreated(r.id);
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const empOptions = [
    ...(self ? [{ value: self.id, label: `${self.code} — ${self.fullName} (tôi)` }] : []),
    ...(canOthers ? (employees?.items ?? []).filter((e) => e.id !== self?.id).map((e) => ({ value: e.id, label: `${e.code} — ${e.fullName} (${e.unit.name})` })) : []),
  ];

  return (
    <Modal open={open} title="Tạo phiếu nghỉ / công tác / học tập" width={720} onCancel={onClose} onOk={() => form.submit()} okText="Gửi phiếu" confirmLoading={saving} destroyOnHidden>
      {!canOthers && !self && open && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Tài khoản chưa liên kết hồ sơ nhân sự — liên hệ Phòng TCCB." />}
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ startSession: 'AM', endSession: 'PM' }}>
        <Row gutter={16}>
          <Col xs={24} sm={14}>
            <Form.Item name="employeeId" label="Nhân viên" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
              <Select showSearch filterOption={false} onSearch={setEmpSearch} disabled={!canOthers} options={empOptions} placeholder="Gõ mã hoặc tên" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="leaveTypeId" label="Loại phiếu" rules={[{ required: true, message: 'Chọn loại phiếu' }]}>
              <Select options={types?.map((t) => ({ value: t.id, label: `${t.symbol} — ${t.name}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="range" label="Từ ngày – đến ngày" rules={[{ required: true, message: 'Chọn thời gian' }]}>
              <DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="startSession" label="Bắt đầu từ buổi">
              <Select options={Object.entries(HALF_DAYS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="endSession" label="Kết thúc hết buổi">
              <Select options={Object.entries(HALF_DAYS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          {days !== null && (
            <Col span={24}>
              <Alert type="info" style={{ marginBottom: 12 }} message={`Số ngày nghỉ: ${days} (đã trừ ngày lễ)`} />
            </Col>
          )}
          <Col span={24}>
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Nhập lý do' }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="destination" label="Nơi đến (công tác / học tập)">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="fileId" label={`Giấy tờ đính kèm${type?.requiresAttachment ? ' (bắt buộc)' : ''}`} rules={type?.requiresAttachment ? [{ required: true, message: 'Đính kèm giấy tờ' }] : []}>
              <FileUpload />
            </Form.Item>
          </Col>
          {steps.filter((s) => s.approverType === 'SELECTED').map((s) => (
            <Col span={24} key={s.stepOrder}>
              <Form.Item name={`step_${s.stepOrder}`} label={`Người duyệt — bước ${s.stepOrder}: ${s.name}`} rules={[{ required: true, message: 'Chọn người duyệt' }]}>
                <Select
                  mode="multiple"
                  showSearch
                  filterOption={false}
                  onSearch={setUserSearch}
                  placeholder="Gõ tên để tìm"
                  options={users?.map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})${u.unit ? ` — ${u.unit.name}` : ''}` }))}
                />
              </Form.Item>
            </Col>
          ))}
          {steps.length > 0 && (
            <Col span={24}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Quy trình: {steps.map((s) => s.name).join(' → ')}
              </Typography.Text>
            </Col>
          )}
        </Row>
      </Form>
    </Modal>
  );
}

interface LeaveDetail extends LeaveRow {
  destination: string | null;
  fileId: string | null;
  decidedAt: string | null;
  approval: {
    id: string;
    status: string;
    currentStep: number;
    steps: { stepOrder: number; name: string; assignees: { id: string; fullName: string }[] }[];
    actions: { id: string; actorName: string; action: string; comment: string | null; createdAt: string }[];
  } | null;
}

function LeaveDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const can = useCan();
  const { data: r, isLoading } = useQuery({ queryKey: ['leave-request', id], queryFn: () => api<LeaveDetail>(`/leave/requests/${id}`), enabled: !!id });

  const cancel = () => {
    let reason = '';
    modal.confirm({
      title: `Hủy phiếu ${r?.code}?`,
      content: r?.status === 'APPROVED' ? <Input.TextArea rows={2} placeholder="Lý do hủy (bắt buộc) — bảng công sẽ được tính lại" onChange={(e) => (reason = e.target.value)} /> : 'Phiếu đang chờ duyệt sẽ bị hủy.',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/leave/requests/${id}/cancel`, { method: 'POST', body: { reason } });
          message.success('Đã hủy phiếu');
          queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
          queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
        } catch (e) {
          message.error(errorMessage(e));
          throw e;
        }
      },
    });
  };

  const currentIndex = r?.approval ? r.approval.steps.findIndex((s) => s.stepOrder === r.approval!.currentStep) : 0;
  return (
    <Drawer open={!!id} onClose={onClose} width={600} title={r ? `Phiếu ${r.code}` : 'Chi tiết phiếu'} destroyOnHidden
      extra={r && (r.status === 'PENDING' || (r.status === 'APPROVED' && can('leave.type.manage'))) && <Button danger icon={<StopOutlined />} onClick={cancel}>Hủy phiếu</Button>}
    >
      {isLoading || !r ? <Spin /> : (
        <>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Nhân viên">{r.employee.fullName} ({r.employee.code}) — {r.employee.unit.name}</Descriptions.Item>
            <Descriptions.Item label="Loại">{r.leaveType.name} <Tag>{r.leaveType.symbol}</Tag></Descriptions.Item>
            <Descriptions.Item label="Thời gian">{period(r)} · <b>{r.days} ngày</b></Descriptions.Item>
            <Descriptions.Item label="Lý do">{r.reason}</Descriptions.Item>
            {r.destination && <Descriptions.Item label="Nơi đến">{r.destination}</Descriptions.Item>}
            {r.fileId && <Descriptions.Item label="Giấy tờ"><a href={fileUrl(r.fileId)} target="_blank" rel="noreferrer">Xem file</a></Descriptions.Item>}
            <Descriptions.Item label="Trạng thái"><Tag color={STATUS_COLOR[r.status]}>{LEAVE_STATUSES[r.status]}</Tag></Descriptions.Item>
          </Descriptions>
          {r.approval && (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>Quy trình duyệt</Typography.Title>
              <Steps
                direction="vertical"
                size="small"
                current={r.approval.status === 'APPROVED' ? r.approval.steps.length : currentIndex}
                status={r.approval.status === 'REJECTED' || r.approval.status === 'CANCELLED' ? 'error' : undefined}
                items={r.approval.steps.map((s) => ({ title: s.name, description: s.assignees.map((a) => a.fullName).join(', ') || 'Chưa đến bước này' }))}
              />
              <Timeline
                style={{ marginTop: 12 }}
                items={r.approval.actions.map((a) => ({
                  children: (
                    <>
                      <b>{ACTION_LABEL[a.action] ?? a.action}</b> — {a.actorName} · {formatDateTime(a.createdAt)}
                      {a.comment && <div style={{ color: 'var(--bm-text-secondary)' }}>“{a.comment}”</div>}
                    </>
                  ),
                }))}
              />
              <Space>
                <Typography.Text type="secondary">Người duyệt xử lý phiếu tại</Typography.Text>
                <a href={`/approvals?open=${r.approval.id}`}>Việc cần duyệt</a>
              </Space>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
