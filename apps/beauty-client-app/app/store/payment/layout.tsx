import type { Metadata } from "next";
import { PRIVATE_PAGE, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  // The store layout's plain title stops the site-wide template reaching this page.
  title: { absolute: `Store Payment | ${SITE_NAME}` },
  description: "Complete your Blush With Tee store payment.",
  robots: PRIVATE_PAGE,
  alternates: { canonical: null },
};

export default function StorePaymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
