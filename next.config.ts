import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The service-role key must never reach the browser bundle.
  serverExternalPackages: [],
};

export default nextConfig;
