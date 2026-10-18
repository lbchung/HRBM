'use client';

import { ToolOutlined } from '@ant-design/icons';
import { Card, Result, Tag } from 'antd';
import { PageHeader } from './PageHeader';

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <Result
          icon={<ToolOutlined style={{ color: 'var(--bm-primary)' }} />}
          title="Chức năng đang được phát triển"
          subTitle={
            <>
              Chức năng này nằm trong kế hoạch triển khai <Tag color="green">{phase}</Tag>
            </>
          }
        />
      </Card>
    </>
  );
}
