'use client';

import { useQuery } from '@tanstack/react-query';
import { Select } from 'antd';
import { useState } from 'react';
import type { Paginated } from '@bachmai/shared';
import { api } from '@/lib/api';

interface EmployeeOption {
  id: string;
  code: string;
  fullName: string;
  unit: { name: string };
}

/** Chọn nhân viên (tìm theo mã / tên, trong phạm vi dữ liệu của người dùng) */
export function EmployeeSelect({
  value,
  onChange,
  unitId,
  placeholder = 'Gõ mã hoặc tên nhân viên',
  style,
  onPick,
}: {
  value?: string;
  onChange?: (v?: string) => void;
  unitId?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  /** Gọi kèm thông tin nhân viên khi chọn */
  onPick?: (e: EmployeeOption | undefined) => void;
}) {
  const [search, setSearch] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['employees', 'pick', search, unitId],
    queryFn: () => api<Paginated<EmployeeOption>>('/hr/employees', { query: { search, unitId, pageSize: 30 } }),
  });
  return (
    <Select
      showSearch
      allowClear
      value={value}
      filterOption={false}
      loading={isFetching}
      onSearch={setSearch}
      placeholder={placeholder}
      style={style}
      onChange={(v?: string) => {
        onChange?.(v);
        onPick?.(data?.items.find((e) => e.id === v));
      }}
      options={data?.items.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullName} (${e.unit.name})` }))}
    />
  );
}
