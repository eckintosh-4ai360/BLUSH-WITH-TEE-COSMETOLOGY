import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store",
  description: "Professional beauty essentials and salon kits from the Blush With Tee academy store.",
  alternates: { canonical: "/store" },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
