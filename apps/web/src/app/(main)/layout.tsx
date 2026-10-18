import { AppShell } from '@/components/AppShell';
import { CampusFilterProvider } from '@/lib/campus-filter';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <CampusFilterProvider>
      <AppShell>{children}</AppShell>
    </CampusFilterProvider>
  );
}
