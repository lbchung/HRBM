import type { Metadata, Viewport } from 'next';
import { Noto_Serif, Roboto } from 'next/font/google';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from './providers';
import './globals.css';

const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
});

const notoSerif = Noto_Serif({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700'],
  variable: '--font-noto-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'HRM — Bệnh viện Bạch Mai', template: '%s | HRM Bạch Mai' },
  description: 'Hệ thống Quản lý Nhân sự, Chấm công, Tiền lương — Bệnh viện Bạch Mai',
  icons: { icon: '/logo-mobile.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#008046',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${roboto.variable} ${notoSerif.variable}`}>
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
