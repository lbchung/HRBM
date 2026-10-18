'use client';

import { BellOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Empty, List, Popover, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
  };

  const openItem = async (n: Notification) => {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    refresh();
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    refresh();
  };

  const content = (
    <div style={{ width: 360, maxWidth: '86vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>Thông báo</Typography.Text>
        {!!data?.unread && (
          <Button size="small" type="link" onClick={readAll}>
            Đánh dấu đã đọc hết
          </Button>
        )}
      </div>
      {data?.items.length ? (
        <List
          size="small"
          dataSource={data.items}
          style={{ maxHeight: 420, overflow: 'auto' }}
          renderItem={(n) => (
            <List.Item
              onClick={() => openItem(n)}
              style={{ cursor: 'pointer', background: n.readAt ? undefined : 'rgba(0,128,70,0.06)', paddingInline: 8, borderRadius: 6 }}
            >
              <List.Item.Meta
                title={<span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</span>}
                description={
                  <>
                    {n.body && <div>{n.body}</div>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(n.createdAt)}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo" />
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight">
      <Badge count={data?.unread ?? 0} size="small" offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined />} aria-label="Thông báo" />
      </Badge>
    </Popover>
  );
}
