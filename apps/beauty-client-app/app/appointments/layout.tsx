import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salon: Book a Beauty Service",
  description: "Book hair, makeup, nail and skincare services at the Blush With Tee salon, or request a home service.",
  alternates: { canonical: "/appointments" },
};

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
