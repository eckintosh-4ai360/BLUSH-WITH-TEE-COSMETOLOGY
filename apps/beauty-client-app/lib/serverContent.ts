import { clientAppRouter } from "@blush/api/client-router";
import { siteUrl } from "@/lib/site";

// Published website content read on the server, so pages and posts arrive as HTML that search
// engines can index. These are the same public procedures the browser calls.
export function publicContent() {
  return clientAppRouter.createCaller({
    req: new Request(siteUrl()),
    user: null,
    ipAddress: null,
    userAgent: null,
  }).content;
}

// A post's date as the blog shows it, read in UTC because Ghana keeps GMT.
export function formatPostDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}
