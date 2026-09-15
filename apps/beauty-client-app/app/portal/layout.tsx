import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Student Portal",
  description: "Your Blush With Tee student portal.",
  robots: PRIVATE_PAGE,
  alternates: { canonical: null },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
