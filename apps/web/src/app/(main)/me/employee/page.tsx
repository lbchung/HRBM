'use client';

import { useQuery } from '@tanstack/react-query';
import { Result, Spin } from 'antd';
import { api } from '@/lib/api';
import { EmployeeDetail } from '../../hr/employees/EmployeeDetail';

export default function MyEmployeePage() {
  const { data, isLoading } = useQuery({ queryKey: ['employee', 'me'], queryFn: () => api<{ id: string } | null>('/hr/employees/me') });
  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (!data) {
    return (
      <Result
        status="info"
        title="Tài khoản chưa liên kết hồ sơ nhân sự"
        subTitle="Vui lòng liên hệ Phòng Tổ chức cán bộ để liên kết tài khoản với hồ sơ của bạn."
      />
    );
  }
  return <EmployeeDetail id={data.id} />;
}
