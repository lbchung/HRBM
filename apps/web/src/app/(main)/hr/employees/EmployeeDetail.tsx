'use client';

import { DeleteOutlined, EditOutlined, UserAddOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Descriptions, Drawer, Result, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldRenderer } from '@/components/FormFields';
import { RecordTab } from '@/components/RecordTab';
import { api, fileUrl } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth';
import { useCatalogs } from '@/lib/catalogs';
import { errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { EmployeeForm, type EmployeeRecord } from './EmployeeForm';
import { EMPLOYEE_SECTIONS, StatusTag, SUB_FIELDS } from './fields';

interface AuditRow {
  id: string;
  username: string | null;
  action: string;
  entity: string;
  createdAt: string;
}

const ENTITY_LABELS: Record<string, string> = {
  employee: 'Hồ sơ',
  'employee.family': 'Gia đình',
  'employee.work-history': 'Quá trình công tác',
  'employee.contracts': 'Hợp đồng',
  'employee.assignments': 'Phân công cơ sở',
  'employee.documents': 'Tài liệu',
  'employee.trainings': 'Đào tạo',
  'employee.rewards': 'Khen thưởng',
  'employee.disciplines': 'Kỷ luật',
  'employee.salaries': 'Lương',
  'employee.allowances': 'Phụ cấp',
  'employee.income-coefficients': 'Hệ số thu nhập',
};
const ACTION_LABELS: Record<string, string> = { CREATE: 'Thêm', UPDATE: 'Sửa', DELETE: 'Xóa', CREATE_ACCOUNT: 'Tạo tài khoản', IMPORT: 'Import' };

export function EmployeeDetail({ id }: { id: string }) {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const can = useCan();
  const { data: me } = useMe();
  const catalogs = useCatalogs();
  const render = useFieldRenderer();
  const [editing, setEditing] = useState(false);

  const { data: e, isLoading, error } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api<EmployeeRecord>(`/hr/employees/${id}`),
  });
  const isSelf = !!e && e.userId === me?.id;
  const canHistory = can('hr.employee.read');
  const { data: history } = useQuery({
    queryKey: ['employee', id, 'history'],
    queryFn: () => api<AuditRow[]>(`/hr/employees/${id}/history`),
    enabled: canHistory && !!e,
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (error || !e) return <Result status="404" title="Không tìm thấy hồ sơ" subTitle={errorMessage(error)} />;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['employee', id] });
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  const createAccount = () =>
    modal.confirm({
      title: 'Tạo tài khoản đăng nhập',
      content: `Tạo tài khoản nhóm "Nhân viên" cho ${e.fullName}, tên đăng nhập là mã nhân viên (${e.code.toLowerCase()})?`,
      onOk: async () => {
        try {
          const r = await api<{ username: string; temporaryPassword: string }>(`/hr/employees/${id}/account`, { method: 'POST' });
          refresh();
          modal.success({
            title: 'Đã tạo tài khoản',
            content: (
              <>
                <p>
                  Tên đăng nhập: <b>{r.username}</b>
                </p>
                <Typography.Paragraph copyable={{ text: r.temporaryPassword }} code style={{ fontSize: 18 }}>
                  {r.temporaryPassword}
                </Typography.Paragraph>
                <Typography.Text type="warning">Mật khẩu tạm chỉ hiển thị một lần. Nhân viên phải đổi khi đăng nhập lần đầu.</Typography.Text>
              </>
            ),
          });
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  const remove = () =>
    modal.confirm({
      title: 'Xóa hồ sơ nhân viên',
      content: `Xóa hồ sơ ${e.code} — ${e.fullName}? Hồ sơ được lưu trữ, không hiển thị trong danh sách.`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/hr/employees/${id}`, { method: 'DELETE' });
          message.success('Đã xóa hồ sơ');
          queryClient.invalidateQueries({ queryKey: ['employees'] });
          router.replace('/hr/employees');
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  const base = `/hr/employees/${id}`;
  const canSalary = isSelf || can('hr.salary.read');
  const tab = (key: string, label: string, resource: string, title: string, perm: string, extra?: { onChanged?: () => void; defaults?: Record<string, unknown> }) => ({
    key,
    label,
    children: <RecordTab endpoint={`${base}/${resource}`} title={title} fields={SUB_FIELDS[resource]} canEdit={can(perm) && !isSelf} {...extra} />,
  });

  const items = [
    {
      key: 'general',
      label: 'Thông tin chung',
      children: EMPLOYEE_SECTIONS.map((s) => (
        <Card key={s.title} size="small" title={s.title} style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
            {s.fields
              .filter((f) => f.type !== 'file')
              .map((f) => (
                <Descriptions.Item key={f.name} label={f.label} span={f.span === 24 ? 3 : 1}>
                  {f.name === 'status' ? <StatusTag status={e.status} /> : render(f, e)}
                </Descriptions.Item>
              ))}
          </Descriptions>
        </Card>
      )),
    },
    tab('family', 'Gia đình', 'family', 'Quan hệ gia đình & người phụ thuộc', 'hr.employee.update'),
    tab('work', 'Quá trình công tác', 'work-history', 'Quá trình công tác', 'hr.employee.update', { onChanged: refresh }),
    tab('contracts', 'Hợp đồng', 'contracts', 'Hợp đồng', 'hr.employee.update', { defaults: { salaryForm: 'COEFFICIENT' } }),
    tab('assignments', 'Phân công cơ sở', 'assignments', 'Phân công làm việc tại cơ sở', 'hr.assignment.manage'),
    tab('trainings', 'Đào tạo', 'trainings', 'Quá trình đào tạo, chứng chỉ', 'hr.training.manage'),
    {
      key: 'rewards',
      label: 'Khen thưởng - Kỷ luật',
      children: (
        <>
          <RecordTab endpoint={`${base}/rewards`} title="Khen thưởng" fields={SUB_FIELDS.rewards} canEdit={can('hr.reward.manage') && !isSelf} defaults={{ year: new Date().getFullYear() }} />
          <RecordTab endpoint={`${base}/disciplines`} title="Kỷ luật" fields={SUB_FIELDS.disciplines} canEdit={can('hr.reward.manage') && !isSelf} />
        </>
      ),
    },
    ...(canSalary
      ? [
          {
            key: 'salary',
            label: 'Lương & phụ cấp',
            children: (
              <>
                <RecordTab endpoint={`${base}/salaries`} title="Diễn biến lương" fields={SUB_FIELDS.salaries} canEdit={can('hr.salary.manage') && !isSelf} defaults={{ salaryForm: 'COEFFICIENT' }} modalWidth={820} />
                <RecordTab endpoint={`${base}/allowances`} title="Phụ cấp" fields={SUB_FIELDS.allowances} canEdit={can('hr.salary.manage') && !isSelf} />
                <RecordTab endpoint={`${base}/income-coefficients`} title="Hệ số ổn định thu nhập, quản lý, khác" fields={SUB_FIELDS['income-coefficients']} canEdit={can('hr.salary.manage') && !isSelf} />
              </>
            ),
          },
        ]
      : []),
    tab('documents', 'Tài liệu', 'documents', 'Tài liệu hồ sơ', 'hr.employee.update'),
    ...(canHistory
      ? [
          {
            key: 'history',
            label: 'Lịch sử thay đổi',
            children: (
              <Card size="small">
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={history}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: 'Thời gian', dataIndex: 'createdAt', render: formatDateTime, width: 150 },
                    { title: 'Người thực hiện', dataIndex: 'username' },
                    { title: 'Thao tác', dataIndex: 'action', render: (a: string) => ACTION_LABELS[a] ?? a },
                    { title: 'Nội dung', dataIndex: 'entity', render: (x: string) => ENTITY_LABELS[x] ?? x },
                  ]}
                />
              </Card>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <Avatar size={72} src={e.photoFileId ? fileUrl(e.photoFileId) : undefined} style={{ background: 'var(--bm-primary)', fontSize: 28 }}>
            {e.fullName.trim().split(/\s+/).pop()?.[0]}
          </Avatar>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Typography.Title level={3} className="bm-heading" style={{ margin: 0 }}>
              {e.fullName}
            </Typography.Title>
            <Space wrap size={4} style={{ marginTop: 6 }}>
              <Tag>{e.code}</Tag>
              <StatusTag status={e.status} />
              <Tag color="green">{e.unit?.name}</Tag>
              <Tag>{e.campus?.name}</Tag>
              {e.positionCode && <Tag color="gold">{catalogs.name('POSITION', e.positionCode)}</Tag>}
              {e.source === 'FAST' && <Tag color="cyan">Đồng bộ từ Fast</Tag>}
              {e.user ? <Tag color="blue">Tài khoản: {e.user.username}</Tag> : null}
            </Space>
          </div>
          {!isSelf && (
            <Space wrap>
              {can('hr.employee.update') && (
                <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                  Sửa hồ sơ
                </Button>
              )}
              {!e.user && can(['system.user.create']) && can('hr.employee.update') && (
                <Button icon={<UserAddOutlined />} onClick={createAccount}>
                  Tạo tài khoản
                </Button>
              )}
              {can('hr.employee.delete') && <Button danger icon={<DeleteOutlined />} onClick={remove} aria-label="Xóa hồ sơ" />}
            </Space>
          )}
        </div>
      </Card>
      <Tabs items={items} destroyOnHidden />
      <Drawer open={editing} onClose={() => setEditing(false)} width={960} title={`Sửa hồ sơ: ${e.fullName}`} destroyOnHidden>
        <EmployeeForm
          employee={e}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      </Drawer>
    </>
  );
}
