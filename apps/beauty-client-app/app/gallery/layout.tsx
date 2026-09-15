import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Beauty work created in the Blush With Tee studios.",
  alternates: { canonical: "/gallery" },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
