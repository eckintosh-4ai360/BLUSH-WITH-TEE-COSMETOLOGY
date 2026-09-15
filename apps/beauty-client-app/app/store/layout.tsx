import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store",
  description: "Shop professional beauty tools, skincare, hair products and kits from the Blush With Tee store.",
  alternates: { canonical: "/store" },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
