export const SITE_NAME = "BWT School of Cosmetology";

export const SITE_DESCRIPTION =
  "Apply to a professional cosmetology programme, book a student-clinic beauty service, and shop academy essentials at Blush With Tee School of Cosmetology.";

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
