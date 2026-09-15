import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Verify a Certificate",
  description: "Check that a certificate was issued by Blush With Tee School of Cosmetology.",
  robots: PRIVATE_PAGE,
  alternates: { canonical: null },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
