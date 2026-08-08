import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@politeia/quorum-contracts'],
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  async rewrites() {
    const apiBase = (process.env.QUORUM_API_BASE_URL || '').replace(/\/$/, '');
    return apiBase ? [{ source: '/api/quorum/:path*', destination: `${apiBase}/:path*` }] : [];
  },
};

export default nextConfig;
