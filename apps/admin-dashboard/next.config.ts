import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * `frame-ancestors` is set through CSP rather than a full content policy: Next
 * emits inline bootstrap scripts, so a script-src policy needs a nonce pipeline
 * to be anything but decorative. Clickjacking, sniffing and referrer leakage
 * are worth closing now regardless.
 */
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
};

export default nextConfig;
