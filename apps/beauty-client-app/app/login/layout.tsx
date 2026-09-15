import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to the Blush With Tee student portal.",
  robots: PRIVATE_PAGE,
  alternates: { canonical: null },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
