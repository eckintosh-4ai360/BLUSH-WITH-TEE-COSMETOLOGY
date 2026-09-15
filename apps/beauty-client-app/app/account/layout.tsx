import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your Account",
  description: "Manage your Blush With Tee account.",
  robots: PRIVATE_PAGE,
  alternates: { canonical: null },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
