import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ThemeProvider, ThemeScript } from "@blush/ui/theme";
import { TooltipProvider } from "@blush/ui/components/ui/tooltip";
import { Toaster } from "@blush/ui/components/ui/sonner";
import "@blush/ui/globals.css";
import { TrpcProvider } from "@/components/TrpcProvider";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "GlowCraft Admin Dashboard",
  description:
    "Back-office workspace for admissions, students, inventory, orders, finance, and operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sora.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* First thing in the document so the stored theme is on <html>
            before the browser paints, instead of after React hydrates. */}
        <ThemeScript defaultTheme="system" />
        <TrpcProvider>
          <ThemeProvider defaultTheme="system" switchable>
            <TooltipProvider>
              <Toaster />
              {children}
            </TooltipProvider>
          </ThemeProvider>
        </TrpcProvider>
      </body>
    </html>
  );
}
