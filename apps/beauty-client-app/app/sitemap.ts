import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// The public pages. Sign-in, the portal, payments and certificate lookups stay out.
const PAGES: { path: string; changeFrequency: "daily" | "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/programs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/apply", changeFrequency: "monthly", priority: 0.9 },
  { path: "/appointments", changeFrequency: "weekly", priority: 0.8 },
  { path: "/store", changeFrequency: "daily", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/gallery", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return PAGES.map(page => ({
    url: new URL(page.path, origin).toString(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
