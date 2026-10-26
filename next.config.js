/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: '/grades',
        destination: '/tos',
        permanent: false,
      },
      {
        source: '/grades/:path*',
        destination: '/tos',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
