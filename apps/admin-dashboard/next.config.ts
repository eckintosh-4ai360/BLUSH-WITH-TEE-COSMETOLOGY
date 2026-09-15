import type { NextConfig } from "next";

// Response headers applied to every route.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Only honoured over TLS, so it is inert in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

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
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Files used to be served from /api/manus-storage. Low-stock emails already sent link there.
  async redirects() {
    return [
      { source: "/api/manus-storage/:path*", destination: "/api/storage/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
