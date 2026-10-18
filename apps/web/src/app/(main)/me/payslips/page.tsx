'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, List, Row, Spin, Typography } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PayslipView } from '@/components/Payslip';
import { api } from '@/lib/api';
import { money, monthLabel, type PayslipDetail } from '@/lib/payroll';

interface MySlip { id: string; gross: string; deductions: string; net: string; run: { code: string; month: string; name: string; closedAt: string | null } }

export default function MyPayslipsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-payslips'], queryFn: () => api<MySlip[]>('/payroll/payslips/me') });
  const [selected, setSelected] = useState<string | null>(null);
  const id = selected ?? data?.[0]?.id ?? null;
  const { data: slip, isFetching } = useQuery({ queryKey: ['payslip', id], queryFn: () => api<PayslipDetail>(`/payroll/items/${id}`), enabled: !!id });
  if (isLoading) return <Spin />;
  return (
    <>
      <PageHeader title="Phiếu lương của tôi" />
      {!data?.length ? (
        <Card><Empty description="Chưa có phiếu lương (chỉ hiển thị kỳ lương đã chốt)" /></Card>
      ) : (
        <Row gutter={16}>
          <Col xs={24} md={8} lg={6}>
            <Card size="small" style={{ marginBottom: 16 }}>
              <List
                dataSource={data}
                renderItem={(s) => (
                  <List.Item onClick={() => setSelected(s.id)} style={{ cursor: 'pointer', background: s.id === id ? 'var(--bm-bg-secondary, #f5f5f5)' : undefined, padding: '8px 12px' }}>
                    <List.Item.Meta title={`Tháng ${monthLabel(s.run.month)}`} description={<Typography.Text>Thực lĩnh: <b>{money(s.net)}</b></Typography.Text>} />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} md={16} lg={18}>
            <Card>{isFetching || !slip ? <Spin /> : <PayslipView slip={slip} />}</Card>
          </Col>
        </Row>
      )}
    </>
  );
}
