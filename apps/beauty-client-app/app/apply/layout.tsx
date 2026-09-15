import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply online for a programme at Blush With Tee School of Cosmetology and choose your intake.",
  alternates: { canonical: "/apply" },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
