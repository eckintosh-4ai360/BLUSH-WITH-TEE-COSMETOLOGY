import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@blush/ui",
    "@blush/api",
    "@blush/auth",
    "@blush/db",
    "@blush/env",
    "@blush/shared",
    "@blush/storage",
  ],
};

export default nextConfig;
