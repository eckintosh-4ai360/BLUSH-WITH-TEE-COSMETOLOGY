import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Private pages are not disallowed here: a crawler that cannot fetch a page never sees its
// noindex tag, and can still list the bare address if another site links to it. Uploaded
// images under /api/storage stay crawlable.
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/trpc/", "/api/webhooks/"] }],
    sitemap: new URL("/sitemap.xml", origin).toString(),
    host: origin.origin,
  };
}
