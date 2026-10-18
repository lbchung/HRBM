'use client';

import { Tabs } from 'antd';
import { employeeColumns, ReportPage } from '@/components/ReportPage';
import { useCatalogs } from '@/lib/catalogs';
import { formatDay, formatNumber } from '@/lib/format';

export default function RewardsReportPage() {
  const catalogs = useCatalogs();
  return (
    <Tabs
      destroyOnHidden
      items={[
        {
          key: 'rewards',
          label: 'Khen thưởng',
          children: (
            <ReportPage
              title="Khen thưởng"
              endpoint="/hr/reports/rewards"
              typeCatalog="REWARD_FORM"
              typeLabel="Hình thức"
              showYear
              columns={[
                ...employeeColumns,
                { title: 'Năm', dataIndex: 'year', width: 70 },
                { title: 'Hình thức', key: 'form', render: (_, r) => catalogs.name('REWARD_FORM', r.formCode) },
                { title: 'Cấp', key: 'level', render: (_, r) => catalogs.name('REWARD_LEVEL', r.levelCode) },
                { title: 'Số quyết định', dataIndex: 'decisionNo', render: (v) => v ?? '—' },
                { title: 'Nội dung', dataIndex: 'content', render: (v) => v ?? '—' },
                { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => formatNumber(v, 0) },
              ]}
            />
          ),
        },
        {
          key: 'disciplines',
          label: 'Kỷ luật',
          children: (
            <ReportPage
              title="Kỷ luật"
              endpoint="/hr/reports/disciplines"
              typeCatalog="DISCIPLINE_FORM"
              typeLabel="Hình thức"
              showYear
              columns={[
                ...employeeColumns,
                { title: 'Hình thức', key: 'form', render: (_, r) => catalogs.name('DISCIPLINE_FORM', r.formCode) },
                { title: 'Hiệu lực', key: 'time', render: (_, r) => `${formatDay(r.effectiveFrom)} – ${formatDay(r.effectiveTo)}` },
                { title: 'Kéo dài nâng lương', dataIndex: 'delayRaiseMonths', render: (v) => (v ? `${v} tháng` : '—') },
                { title: 'Số quyết định', dataIndex: 'decisionNo', render: (v) => v ?? '—' },
                { title: 'Lý do', dataIndex: 'reason', render: (v) => v ?? '—' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
