/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimizations for browser rendering / paint
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
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

export default nextConfig;

