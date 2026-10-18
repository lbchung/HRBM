import { join } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

config({ path: join(__dirname, '../../.env') });

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@bachmai/ui'],
  // Cùng origin với API → cookie httpOnly hoạt động, không cần CORS
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
