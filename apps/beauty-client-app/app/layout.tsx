import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ThemeProvider } from "@blush/ui/theme";
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
  title: "BWT School of Cosmetology",
  description: "Apply to a professional cosmetology programme, book a student-clinic beauty service, and shop academy essentials at Blush With Tee School of Cosmetology.",
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
