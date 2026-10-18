'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Descriptions, Divider, Drawer, Spin, Table, Tag, Typography } from 'antd';
import { COMPONENT_KINDS, type ComponentKind } from '@bachmai/shared';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { money, monthLabel, RUN_STATUS, type PayslipDetail, type PayslipLine } from '@/lib/payroll';

const SECTIONS: ComponentKind[] = ['EARNING', 'DEDUCTION', 'EMPLOYER'];

/** Nội dung phiếu lương: thu nhập, khấu trừ, đơn vị đóng; dòng trung gian chỉ hiện khi showInfo */
export function PayslipView({ slip, showInfo = false }: { slip: PayslipDetail; showInfo?: boolean }) {
  const visible = (l: PayslipLine) => !l.hidden && (Number(l.amount) !== 0 || l.kind === 'INFO');
  const section = (kind: ComponentKind) => slip.lines.filter((l) => l.kind === kind && visible(l));
  return (
    <>
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="Nhân viên">{slip.employee.fullName} ({slip.employee.code})</Descriptions.Item>
        <Descriptions.Item label="Kỳ lương">{monthLabel(slip.run.month)} <Tag color={RUN_STATUS[slip.run.status].color}>{RUN_STATUS[slip.run.status].label}</Tag></Descriptions.Item>
        <Descriptions.Item label="Đơn vị">{slip.employee.unit.name}</Descriptions.Item>
        <Descriptions.Item label="Cơ sở">{slip.employee.campus.name}</Descriptions.Item>
        <Descriptions.Item label="Hệ số / ngày công">
          {formatNumber(slip.inputs.COEF)} · {formatNumber(slip.inputs.WORK_UNITS)} công
        </Descriptions.Item>
        <Descriptions.Item label="Người phụ thuộc">{slip.inputs.DEPENDANTS ?? 0}</Descriptions.Item>
      </Descriptions>
      {slip.errors?.length ? <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Lưu ý" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{slip.errors.map((e) => <li key={e}>{e}</li>)}</ul>} /> : null}
      {[...SECTIONS, ...(showInfo ? (['INFO'] as ComponentKind[]) : [])].map((k) => {
        const rows = section(k);
        if (!rows.length) return null;
        return (
          <div key={k}>
            <Divider orientation="left" style={{ margin: '16px 0 8px' }}>{COMPONENT_KINDS[k]}</Divider>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              showHeader={false}
              dataSource={rows}
              columns={[
                { dataIndex: 'name', render: (n: string, l) => <>{n}{l.taxable && <Tag style={{ marginLeft: 6 }} color="orange">chịu thuế</Tag>}</> },
                { dataIndex: 'amount', align: 'right', width: 160, render: (v: string, l) => (l.kind === 'INFO' ? formatNumber(v, 4) : money(v)) },
              ]}
            />
          </div>
        );
      })}
      <Descriptions size="small" column={1} bordered style={{ marginTop: 16 }}>
        <Descriptions.Item label="Tổng thu nhập">{money(slip.gross)}</Descriptions.Item>
        <Descriptions.Item label="Thu nhập chịu thuế">{money(slip.taxable)}</Descriptions.Item>
        <Descriptions.Item label="Tổng khấu trừ">{money(slip.deductions)}</Descriptions.Item>
        <Descriptions.Item label={<b>Thực lĩnh</b>}>
          <Typography.Text strong style={{ fontSize: 16, color: 'var(--bm-primary, #008046)' }}>{money(slip.net)} đ</Typography.Text>
        </Descriptions.Item>
      </Descriptions>
    </>
  );
}

export function PayslipDrawer({ id, onClose, showInfo }: { id: string | null; onClose: () => void; showInfo?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ['payslip', id], queryFn: () => api<PayslipDetail>(`/payroll/items/${id}`), enabled: !!id });
  return (
    <Drawer open={!!id} onClose={onClose} width={640} title="Phiếu lương" destroyOnHidden>
      {isLoading || !data ? <Spin /> : <PayslipView slip={data} showInfo={showInfo} />}
    </Drawer>
  );
}
