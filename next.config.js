/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'politeia.ar' },
      { protocol: 'https', hostname: '**.politeia.ar' },
    ],
  },
};

module.exports = nextConfig;
