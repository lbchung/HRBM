'use client';

import { Tag } from 'antd';
import dayjs from 'dayjs';
import { employeeColumns, ReportPage } from '@/components/ReportPage';
import { useCatalogs } from '@/lib/catalogs';
import { formatDay } from '@/lib/format';

export default function ExpiringContractsPage() {
  const catalogs = useCatalogs();
  return (
    <ReportPage
      title="Hợp đồng sắp hết hạn"
      endpoint="/hr/reports/contracts-expiring"
      showExpiring
      expiringDays={60}
      columns={[
        ...employeeColumns,
        { title: 'Số hợp đồng', dataIndex: 'contractNo', render: (v) => v ?? '—' },
        { title: 'Loại', key: 'type', render: (_, r) => catalogs.name('CONTRACT_TYPE', r.contractTypeCode) },
        { title: 'Từ ngày', dataIndex: 'startDate', render: formatDay },
        {
          title: 'Hết hạn',
          dataIndex: 'endDate',
          render: (v: string) => {
            const days = dayjs(v.slice(0, 10)).diff(dayjs().startOf('day'), 'day');
            return (
              <Tag color={days <= 15 ? 'red' : days <= 30 ? 'orange' : 'gold'}>
                {formatDay(v)} · còn {days} ngày
              </Tag>
            );
          },
        },
      ]}
    />
  );
}
