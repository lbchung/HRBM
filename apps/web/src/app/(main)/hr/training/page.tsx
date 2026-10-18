'use client';

import { Tag } from 'antd';
import dayjs from 'dayjs';
import { employeeColumns, ReportPage } from '@/components/ReportPage';
import { useCatalogs } from '@/lib/catalogs';
import { formatDay, formatNumber } from '@/lib/format';

export default function TrainingReportPage() {
  const catalogs = useCatalogs();
  return (
    <ReportPage
      title="Đào tạo, chứng chỉ"
      endpoint="/hr/reports/trainings"
      typeCatalog="TRAINING_TYPE"
      typeLabel="Loại đào tạo"
      showYear
      showExpiring
      columns={[
        ...employeeColumns,
        { title: 'Loại', key: 'type', render: (_, r) => catalogs.name('TRAINING_TYPE', r.trainingTypeCode) },
        { title: 'Khóa học / văn bằng', dataIndex: 'name' },
        { title: 'Cơ sở đào tạo', dataIndex: 'institution', render: (v) => v ?? '—' },
        { title: 'Thời gian', key: 'time', render: (_, r) => `${formatDay(r.fromDate)} – ${formatDay(r.toDate)}` },
        { title: 'Số giờ', dataIndex: 'hours', render: (v) => formatNumber(v), align: 'right' },
        {
          title: 'Hết hạn',
          dataIndex: 'expiryDate',
          render: (v: string | null) => {
            if (!v) return '—';
            const days = dayjs(v.slice(0, 10)).diff(dayjs().startOf('day'), 'day');
            return <Tag color={days < 0 ? 'red' : days <= 60 ? 'orange' : 'default'}>{formatDay(v)}</Tag>;
          },
        },
      ]}
    />
  );
}
