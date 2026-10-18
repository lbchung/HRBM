'use client';

import { Button, Result } from 'antd';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="bm-center-page">
      <Result
        status="404"
        title="Không tìm thấy trang"
        subTitle="Trang bạn truy cập không tồn tại hoặc đã được di chuyển."
        extra={
          <Link href="/">
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    </div>
  );
}
