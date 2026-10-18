'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { useCampusFilter } from '@/lib/campus-filter';
import { EmployeeForm } from '../EmployeeForm';

export default function NewEmployeePage() {
  const router = useRouter();
  const { campusId } = useCampusFilter();
  return (
    <>
      <PageHeader title="Thêm hồ sơ nhân viên" />
      <EmployeeForm
        defaults={campusId ? { campusId } : undefined}
        onSaved={(e) => router.replace(`/hr/employees/${e.id}`)}
        onCancel={() => router.back()}
      />
    </>
  );
}
