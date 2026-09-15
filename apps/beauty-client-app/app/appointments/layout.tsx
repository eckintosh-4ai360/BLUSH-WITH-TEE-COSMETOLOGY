import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a Beauty Service",
  description: "Book a salon appointment or a home service with Blush With Tee. Services are performed by advanced cosmetology students under educator supervision.",
  alternates: { canonical: "/appointments" },
};

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
