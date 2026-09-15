import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ThemeProvider } from "@blush/ui/theme";
import { TooltipProvider } from "@blush/ui/components/ui/tooltip";
import { Toaster } from "@blush/ui/components/ui/sonner";
import "@blush/ui/globals.css";
import { TrpcProvider } from "@/components/TrpcProvider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from "@/lib/site";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  // Each section's layout names its page; the home page keeps the plain school name.
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    images: ["/logo.png"],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>

      <body suppressHydrationWarning>
        <TrpcProvider>
          <ThemeProvider defaultTheme="light">
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
