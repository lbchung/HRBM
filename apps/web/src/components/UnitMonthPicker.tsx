'use client';

import { DatePicker, TreeSelect } from 'antd';
import dayjs from 'dayjs';
import { buildUnitTree, useUnits } from '@/lib/queries';

/** Chọn đơn vị + tháng — dùng cho lịch, bảng công, báo cáo */
export function UnitMonthPicker({
  unitId,
  onUnit,
  month,
  onMonth,
}: {
  unitId?: string;
  onUnit: (id?: string) => void;
  month: string;
  onMonth: (m: string) => void;
}) {
  const { data: units } = useUnits();
  return (
    <>
      <TreeSelect
        showSearch
        treeNodeFilterProp="title"
        placeholder="Chọn đơn vị"
        value={unitId}
        onChange={onUnit}
        treeData={units ? buildUnitTree(units) : []}
        style={{ width: 280 }}
      />
      <DatePicker
        picker="month"
        format="MM/YYYY"
        allowClear={false}
        value={dayjs(`${month}-01`)}
        onChange={(d) => d && onMonth(d.format('YYYY-MM'))}
      />
    </>
  );
}
