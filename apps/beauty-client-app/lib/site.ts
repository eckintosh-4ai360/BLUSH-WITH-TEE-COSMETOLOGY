export const SITE_NAME = "Blush With Tee";

// The home page's title: the three parts of the business, not only the school.
export const SITE_TITLE = "Blush With Tee | School of Cosmetology, Salon & Beauty Store";

export const SITE_DESCRIPTION =
  "Train at BWT School of Cosmetology, book hair, makeup, nail and skincare services at the Blush With Tee salon, and shop professional beauty products in our store.";

// The public origin, for canonical links, the sitemap and link previews.
export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    if (configured) return new URL(configured);
  } catch {
    // A malformed value falls through to the development origin.
  }
  return new URL("http://localhost:3001");
}

// Pages that belong to one person: kept out of search results, still reachable by link.
// Their layouts also clear the canonical link the root layout would otherwise hand down.
export const PRIVATE_PAGE = { index: false, follow: false } as const;
