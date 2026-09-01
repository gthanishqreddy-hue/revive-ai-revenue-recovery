import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server-side file system access for SQLite database
  serverExternalPackages: ['@libsql/client'],
  // Turbopack config (Next.js 16 default)
  turbopack: {},
};

export default nextConfig;
