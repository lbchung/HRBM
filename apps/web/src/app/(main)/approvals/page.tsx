'use client';

import { CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Drawer, Form, Input, Modal, Select, Space, Spin, Steps, Table, Tabs, Tag, Timeline, TreeSelect, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { APPROVAL_STATUS_LABELS, APPROVAL_TARGET_TYPES, type ApprovalStatus, type Paginated } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/types';
import { applyServerErrors, errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { buildUnitTree, useUnits } from '@/lib/queries';

interface Row {
  id: string;
  title: string;
  status: ApprovalStatus;
  targetType: keyof typeof APPROVAL_TARGET_TYPES;
  requesterName: string;
  currentStepName?: string;
  createdAt: string;
  workflow: { name: string };
}
interface Detail {
  id: string;
  title: string;
  content: string | null;
  status: ApprovalStatus;
  targetType: keyof typeof APPROVAL_TARGET_TYPES;
  currentStep: number;
  workflow: { name: string };
  requesterName: string;
  createdAt: string;
  completedAt: string | null;
  canDecide: boolean;
  canCancel: boolean;
  steps: { stepOrder: number; name: string; approverType: string; assignees: { id: string; fullName: string }[] }[];
  actions: { id: string; stepOrder: number; actorName: string; action: string; comment: string | null; createdAt: string }[];
}

const STATUS_COLOR: Record<ApprovalStatus, string> = { PENDING: 'processing', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'default' };
const ACTION_LABEL: Record<string, string> = { SUBMIT: 'Gửi phiếu', APPROVE: 'Duyệt', REJECT: 'Từ chối', CANCEL: 'Hủy phiếu' };
const ACTION_COLOR: Record<string, string> = { SUBMIT: 'blue', APPROVE: 'green', REJECT: 'red', CANCEL: 'gray' };

export default function ApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsContent />
    </Suspense>
  );
}

function ApprovalsContent() {
  const params = useSearchParams();
  const [box, setBox] = useState<'inbox' | 'sent' | 'processed'>('inbox');
  const [page, setPage] = useState({ page: 1, pageSize: 20 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Mở phiếu từ liên kết thông báo: /approvals?open=<id>
  useEffect(() => {
    const id = params.get('open');
    if (id) setOpenId(id);
  }, [params]);
  const { data, isFetching } = useQuery({
    queryKey: ['approvals', box, page],
    queryFn: () => api<Paginated<Row>>('/approvals', { query: { box, ...page } }),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<Row> = [
    {
      title: 'Phiếu',
      key: 'title',
      render: (_, r) => (
        <a onClick={() => setOpenId(r.id)}>
          <Typography.Text strong>{r.title}</Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {APPROVAL_TARGET_TYPES[r.targetType] ?? r.targetType} · {r.workflow.name}
          </Typography.Text>
        </a>
      ),
    },
    { title: 'Người gửi', dataIndex: 'requesterName' },
    { title: 'Ngày gửi', dataIndex: 'createdAt', render: formatDateTime },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color={STATUS_COLOR[r.status]}>{APPROVAL_STATUS_LABELS[r.status]}</Tag>
          {r.status === 'PENDING' && r.currentStepName && <Tag>{r.currentStepName}</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Việc cần duyệt"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Tạo tờ trình
          </Button>
        }
      />
      <Card>
        <Tabs
          activeKey={box}
          onChange={(k) => {
            setBox(k as typeof box);
            setPage((p) => ({ ...p, page: 1 }));
          }}
          items={[
            { key: 'inbox', label: 'Chờ tôi duyệt' },
            { key: 'sent', label: 'Tôi đã gửi' },
            { key: 'processed', label: 'Tôi đã xử lý' },
          ]}
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items}
          loading={isFetching}
          scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onDoubleClick: () => setOpenId(r.id) })}
          pagination={{ current: page.page, pageSize: page.pageSize, total: data?.total, onChange: (p, s) => setPage({ page: p, pageSize: s }) }}
        />
      </Card>
      <DetailDrawer id={openId} onClose={() => setOpenId(null)} />
      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpenId(id)} />
    </>
  );
}

function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: d, isLoading } = useQuery({ queryKey: ['approval', id], queryFn: () => api<Detail>(`/approvals/${id}`), enabled: !!id });

  const act = async (op: 'approve' | 'reject' | 'cancel') => {
    if (op === 'reject' && !comment.trim()) {
      message.warning('Nhập lý do từ chối');
      return;
    }
    setBusy(true);
    try {
      await api(`/approvals/${id}/${op}`, { method: 'POST', body: op === 'cancel' ? undefined : { comment } });
      message.success(op === 'approve' ? 'Đã duyệt' : op === 'reject' ? 'Đã từ chối' : 'Đã hủy phiếu');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['approval', id] });
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const currentIndex = d ? d.steps.findIndex((s) => s.stepOrder === d.currentStep) : 0;

  return (
    <Drawer open={!!id} onClose={onClose} width={640} title={d?.title ?? 'Chi tiết phiếu'} destroyOnHidden>
      {isLoading || !d ? (
        <Spin />
      ) : (
        <>
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Loại">{APPROVAL_TARGET_TYPES[d.targetType] ?? d.targetType}</Descriptions.Item>
            <Descriptions.Item label="Quy trình">{d.workflow.name}</Descriptions.Item>
            <Descriptions.Item label="Người gửi">{d.requesterName}</Descriptions.Item>
            <Descriptions.Item label="Ngày gửi">{formatDateTime(d.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={STATUS_COLOR[d.status]}>{APPROVAL_STATUS_LABELS[d.status]}</Tag>
            </Descriptions.Item>
            {d.content && <Descriptions.Item label="Nội dung"><div style={{ whiteSpace: 'pre-wrap' }}>{d.content}</div></Descriptions.Item>}
          </Descriptions>
          <Typography.Title level={5}>Các bước duyệt</Typography.Title>
          <Steps
            direction="vertical"
            size="small"
            current={d.status === 'APPROVED' ? d.steps.length : currentIndex}
            status={d.status === 'REJECTED' ? 'error' : d.status === 'CANCELLED' ? 'error' : undefined}
            items={d.steps.map((s) => ({
              title: s.name,
              description: s.assignees.length ? s.assignees.map((a) => a.fullName).join(', ') : 'Chưa đến bước này',
            }))}
          />
          <Typography.Title level={5} style={{ marginTop: 16 }}>
            Lịch sử xử lý
          </Typography.Title>
          <Timeline
            items={d.actions.map((a) => ({
              color: ACTION_COLOR[a.action],
              children: (
                <>
                  <b>{ACTION_LABEL[a.action] ?? a.action}</b> — {a.actorName} · {formatDateTime(a.createdAt)}
                  {a.comment && <div style={{ color: 'var(--bm-text-secondary)' }}>“{a.comment}”</div>}
                </>
              ),
            }))}
          />
          {d.canDecide && (
            <Card size="small" title="Ý kiến xử lý">
              <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ý kiến (bắt buộc khi từ chối)" />
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" icon={<CheckOutlined />} loading={busy} onClick={() => act('approve')}>
                  Duyệt
                </Button>
                <Button danger icon={<CloseOutlined />} loading={busy} onClick={() => act('reject')}>
                  Từ chối
                </Button>
              </Space>
            </Card>
          )}
          {d.canCancel && (
            <Button
              danger
              type="link"
              style={{ paddingInline: 0, marginTop: 12 }}
              onClick={() => modal.confirm({ title: 'Hủy phiếu?', okButtonProps: { danger: true }, onOk: () => act('cancel') })}
            >
              Hủy phiếu
            </Button>
          )}
        </>
      )}
    </Drawer>
  );
}

interface WorkflowOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  steps: { stepOrder: number; name: string; approverType: string }[];
}

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: units } = useUnits();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: workflows } = useQuery({
    queryKey: ['approval-workflows', 'GENERAL'],
    queryFn: () => api<WorkflowOption[]>('/approval-workflows', { query: { targetType: 'GENERAL' } }),
    enabled: open,
  });
  const { data: users } = useQuery({
    queryKey: ['users', 'lookup', search],
    queryFn: () => api<{ id: string; fullName: string; username: string; unit: { name: string } | null }[]>('/users/lookup', { query: { search } }),
    enabled: open,
  });
  const workflowCode = Form.useWatch('workflowCode', form);
  const wf = workflows?.find((w) => w.code === workflowCode);

  const submit = async (v: ApiRecord) => {
    setSaving(true);
    try {
      const selectedApprovers = Object.fromEntries((wf?.steps ?? []).filter((s) => s.approverType === 'SELECTED').map((s) => [String(s.stepOrder), v[`step_${s.stepOrder}`] ?? []]));
      const r = await api<{ id: string }>('/approvals', {
        method: 'POST',
        body: { workflowCode: v.workflowCode, title: v.title, content: v.content ?? '', unitId: v.unitId ?? null, selectedApprovers },
      });
      message.success('Đã gửi tờ trình');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      form.resetFields();
      onClose();
      onCreated(r.id);
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Tạo tờ trình / đề xuất" width={640} onCancel={onClose} onOk={() => form.submit()} okText="Gửi" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="workflowCode" label="Quy trình" rules={[{ required: true, message: 'Chọn quy trình' }]}>
          <Select options={workflows?.filter((w) => w.isActive).map((w) => ({ value: w.code, label: w.name }))} />
        </Form.Item>
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="content" label="Nội dung">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="unitId" label="Đơn vị" extra="Bỏ trống = đơn vị của tài khoản">
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeData={units ? buildUnitTree(units) : []} />
        </Form.Item>
        {wf?.steps
          .filter((s) => s.approverType === 'SELECTED')
          .map((s) => (
            <Form.Item key={s.stepOrder} name={`step_${s.stepOrder}`} label={`Người duyệt — bước ${s.stepOrder}: ${s.name}`} rules={[{ required: true, message: 'Chọn người duyệt' }]}>
              <Select
                mode="multiple"
                showSearch
                filterOption={false}
                onSearch={setSearch}
                placeholder="Gõ tên để tìm"
                options={users?.map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})${u.unit ? ` — ${u.unit.name}` : ''}` }))}
              />
            </Form.Item>
          ))}
      </Form>
    </Modal>
  );
}
