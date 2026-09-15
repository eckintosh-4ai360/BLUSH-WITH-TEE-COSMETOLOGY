import type { MetadataRoute } from "next";
import { publicContent } from "@/lib/serverContent";
import { siteUrl } from "@/lib/site";

// Rebuilt hourly, so published pages and posts join it without a redeploy.
export const revalidate = 3600;

// The public pages. Sign-in, the portal, payments and certificate lookups stay out.
const PAGES: { path: string; changeFrequency: "daily" | "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/programs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/apply", changeFrequency: "monthly", priority: 0.9 },
  { path: "/appointments", changeFrequency: "weekly", priority: 0.8 },
  { path: "/store", changeFrequency: "daily", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/gallery", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const entries: MetadataRoute.Sitemap = PAGES.map(page => ({
    url: new URL(page.path, origin).toString(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  // Without the database the fixed pages are still worth listing.
  try {
    const content = publicContent();
    const [pages, posts] = await Promise.all([content.pageLinks(), content.blogPosts({ limit: 100 })]);
    for (const page of pages) {
      entries.push({
        url: new URL(`/pages/${page.slug}`, origin).toString(),
        lastModified: page.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
    for (const post of posts) {
      entries.push({
        url: new URL(`/blog/${post.slug}`, origin).toString(),
        lastModified: post.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  } catch (error) {
    console.error("[Sitemap] Pages and posts could not be listed:", error);
  }

  return entries;
}
