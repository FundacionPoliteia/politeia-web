/** @type {import('next').NextConfig} */
const { version } = require('./package.json');

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'politeia.ar' },
      { protocol: 'https', hostname: '**.politeia.ar' },
    ],
  },
};

module.exports = nextConfig;
