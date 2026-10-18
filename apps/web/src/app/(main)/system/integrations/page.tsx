'use client';

import { SyncOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { RECORD_SOURCES } from '@bachmai/shared';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/form';
import { formatDateTime } from '@/lib/format';

interface Ownership {
  entity: string;
  label: string;
  source: keyof typeof RECORD_SOURCES;
  updatedAt: string | null;
}
interface SyncLog {
  id: string;
  entity: string;
  trigger: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  created: number;
  updated: number;
  failed: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const STATUS_COLOR = { RUNNING: 'processing', SUCCESS: 'success', FAILED: 'error' } as const;
const STATUS_LABEL = { RUNNING: 'Đang chạy', SUCCESS: 'Thành công', FAILED: 'Lỗi' } as const;

export default function IntegrationsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data: status } = useQuery({ queryKey: ['integrations', 'status'], queryFn: () => api<{ fast: { configured: boolean } }>('/integrations/status') });
  const { data: ownership } = useQuery({ queryKey: ['integrations', 'ownership'], queryFn: () => api<Ownership[]>('/integrations/ownership') });
  const { data: logs, isLoading } = useQuery({ queryKey: ['integrations', 'logs'], queryFn: () => api<SyncLog[]>('/integrations/logs') });
  const labelOf = (entity: string) => ownership?.find((o) => o.entity === entity)?.label ?? entity;

  const setSource = async (entity: string, source: string) => {
    try {
      await api(`/integrations/ownership/${entity}`, { method: 'PUT', body: { source } });
      message.success('Đã cập nhật nguồn dữ liệu chuẩn');
      queryClient.invalidateQueries({ queryKey: ['integrations', 'ownership'] });
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api<SyncLog>('/integrations/sync/hr.employee', { method: 'POST' });
      if (r.status === 'SUCCESS') message.success('Đồng bộ thành công');
      else message.warning(r.message ?? 'Đồng bộ không thành công');
      queryClient.invalidateQueries({ queryKey: ['integrations', 'logs'] });
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Kết nối phần mềm Fast"
        extra={
          <Button icon={<SyncOutlined />} loading={syncing} onClick={sync}>
            Đồng bộ hồ sơ nhân viên
          </Button>
        }
      />
      {status && !status.fast.configured && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chưa cấu hình kết nối Fast"
          description="Cần tài liệu API của phần mềm Fast và khai báo FAST_API_URL, FAST_API_KEY trong file .env. Hiện hệ thống chạy độc lập; bản ghi tạo trong hệ thống mới luôn sửa được."
        />
      )}
      <Card title="Nguồn dữ liệu chuẩn" style={{ marginBottom: 16 }}>
        <p style={{ color: 'var(--bm-text-secondary)', marginTop: 0 }}>
          “Phần mềm Fast”: bản ghi đồng bộ từ Fast chỉ đọc trong hệ thống mới. Chuyển sang “Hệ thống mới” khi sẵn sàng thay thế Fast cho loại dữ liệu đó.
        </p>
        <Table
          rowKey="entity"
          size="small"
          pagination={false}
          dataSource={ownership}
          columns={[
            { title: 'Loại dữ liệu', dataIndex: 'label' },
            {
              title: 'Nguồn chuẩn',
              key: 'source',
              width: 220,
              render: (_, o: Ownership) => (
                <Select value={o.source} onChange={(v) => setSource(o.entity, v)} style={{ width: 200 }} options={Object.entries(RECORD_SOURCES).map(([value, label]) => ({ value, label }))} />
              ),
            },
            { title: 'Cập nhật', dataIndex: 'updatedAt', render: formatDateTime },
          ]}
        />
      </Card>
      <Card title="Nhật ký đồng bộ">
        <Table
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={logs}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Bắt đầu', dataIndex: 'startedAt', render: formatDateTime },
            { title: 'Dữ liệu', dataIndex: 'entity', render: labelOf },
            { title: 'Kiểu', dataIndex: 'trigger', render: (t) => (t === 'MANUAL' ? 'Thủ công' : 'Tự động') },
            { title: 'Kết quả', dataIndex: 'status', render: (s: SyncLog['status']) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
            { title: 'Thêm / sửa / lỗi', key: 'n', render: (_, l: SyncLog) => `${l.created} / ${l.updated} / ${l.failed}` },
            { title: 'Thông báo', dataIndex: 'message', render: (m) => m ?? '—' },
          ]}
        />
      </Card>
    </>
  );
}
