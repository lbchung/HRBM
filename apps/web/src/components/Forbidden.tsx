'use client';

import { Button, Result } from 'antd';
import Link from 'next/link';

export function Forbidden() {
  return (
    <Result
      status="403"
      title="Không có quyền truy cập"
      subTitle="Tài khoản của bạn chưa được cấp quyền sử dụng chức năng này. Vui lòng liên hệ quản trị hệ thống."
      extra={
        <Link href="/">
          <Button type="primary">Về trang chủ</Button>
        </Link>
      }
    />
  );
}
