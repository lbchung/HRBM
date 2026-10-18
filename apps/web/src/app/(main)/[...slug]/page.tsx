'use client';

import { notFound, usePathname } from 'next/navigation';
import { ComingSoon } from '@/components/ComingSoon';
import { findMenu } from '@/lib/menu';

/** Trang tạm cho các chức năng có trong menu nhưng chưa phát triển. */
export default function ComingSoonPage() {
  const found = findMenu(usePathname());
  if (!found?.exact || !found.node.comingSoon) notFound();
  return <ComingSoon title={found.node.label} phase={found.node.comingSoon} />;
}
