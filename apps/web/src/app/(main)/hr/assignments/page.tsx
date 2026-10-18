'use client';

import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Col, DatePicker, Form, Input, Modal, Row, Select, TreeSelect } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { employeeColumns, ReportPage } from '@/components/ReportPage';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { errorMessage } from '@/lib/form';
import { formatDay } from '@/lib/format';
import { buildUnitTree, useCampuses, useUnits } from '@/lib/queries';

export default function AssignmentsPage() {
  const can = useCan();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ReportPage
        title="Phân công làm việc giữa cơ sở"
        endpoint="/hr/assignments"
        showMonth
        campusLabel="Cơ sở được phân công"
        extra={
          can('hr.assignment.manage') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              Phân công nhiều người
            </Button>
          )
        }
        columns={[
          ...employeeColumns,
          { title: 'Cơ sở gốc', key: 'home', render: (_, r) => r.employee.campus?.name },
          { title: 'Làm việc tại', key: 'campus', render: (_, r) => <b>{r.campus?.name}</b> },
          { title: 'Đơn vị làm việc', key: 'unit2', render: (_, r) => r.unit?.name ?? '—' },
          { title: 'Thời gian', key: 'time', render: (_, r) => `${formatDay(r.fromDate)} – ${formatDay(r.toDate)}` },
          { title: 'Số quyết định', dataIndex: 'decisionNo', render: (v) => v ?? '—' },
          { title: 'Ghi chú', dataIndex: 'note', render: (v) => v ?? '—' },
        ]}
      />
      <BulkAssignModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

interface EmployeeOption {
  id: string;
  code: string;
  fullName: string;
  unit: { name: string };
}

function BulkAssignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: campuses } = useCampuses();
  const { data: units } = useUnits();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: employees, isFetching } = useQuery({
    queryKey: ['employees', 'pick', search],
    queryFn: () => api<Paginated<EmployeeOption>>('/hr/employees', { query: { search, pageSize: 50 } }),
    enabled: open,
  });

  const submit = async (v: { employeeIds: string[]; campusId: string; unitId?: string; range: [Dayjs, Dayjs]; decisionNo?: string; note?: string }) => {
    setSaving(true);
    try {
      const r = await api<{ created: number }>('/hr/assignments/bulk', {
        method: 'POST',
        body: {
          employeeIds: v.employeeIds,
          campusId: v.campusId,
          unitId: v.unitId ?? null,
          fromDate: v.range[0].format('YYYY-MM-DD'),
          toDate: v.range[1].format('YYYY-MM-DD'),
          decisionNo: v.decisionNo ?? '',
          note: v.note ?? '',
        },
      });
      message.success(`Đã phân công ${r.created} nhân viên`);
      queryClient.invalidateQueries({ queryKey: ['/hr/assignments'] });
      form.resetFields();
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Phân công làm việc tại cơ sở" width={720} onCancel={onClose} onOk={() => form.submit()} okText="Phân công" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="employeeIds" label="Nhân viên" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
          <Select
            mode="multiple"
            showSearch
            filterOption={false}
            onSearch={setSearch}
            loading={isFetching}
            placeholder="Gõ mã hoặc tên để tìm"
            options={employees?.items.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullName} (${e.unit.name})` }))}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="campusId" label="Làm việc tại cơ sở" rules={[{ required: true, message: 'Chọn cơ sở' }]}>
              <Select options={campuses?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="unitId" label="Đơn vị làm việc">
              <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeData={units ? buildUnitTree(units) : []} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="range" label="Thời gian" rules={[{ required: true, message: 'Chọn thời gian' }]}>
              <DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="decisionNo" label="Số quyết định">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="note" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
