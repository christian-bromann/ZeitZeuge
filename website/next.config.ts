import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Include monorepo root in output file tracing so ../docs is bundled
  // for serverless functions (API routes) on Vercel
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
};

export default nextConfig;
