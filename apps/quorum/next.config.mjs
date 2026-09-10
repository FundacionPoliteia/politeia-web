import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@politeia/quorum-contracts'],
  // Only the public origin is exposed, never server credentials or query parameters.
  env: { NEXT_PUBLIC_QUORUM_MEDIA_ORIGIN: mediaOrigin() },
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  async rewrites() {
    const apiBase = (process.env.QUORUM_API_BASE_URL || '').replace(/\/$/, '');
    return apiBase ? [{ source: '/api/quorum/:path*', destination: `${apiBase}/:path*` }] : [];
  },
};

export default nextConfig;

function mediaOrigin() {
  try { return new URL(process.env.QUORUM_API_BASE_URL || process.env.NEXT_PUBLIC_QUORUM_API_BASE_URL || '').origin; }
  catch { return ''; }
}
