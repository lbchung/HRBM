import type { ReactNode } from 'react';

export function PageHeader({ title, extra }: { title: string; extra?: ReactNode }) {
  return (
    <div className="bm-page-header">
      <h2>{title}</h2>
      {extra && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  );
}
