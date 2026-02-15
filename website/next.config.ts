import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No output: 'export' — we need middleware + route handlers for Vercel
  // Pages are still SSG via generateStaticParams
};

export default nextConfig;
