import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programmes",
  description: "Explore the cosmetology programmes at Blush With Tee School of Cosmetology and find the one that suits your goals.",
  alternates: { canonical: "/programs" },
};

export default function ProgramsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
