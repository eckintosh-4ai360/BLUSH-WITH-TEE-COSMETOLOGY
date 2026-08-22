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
  title: "GlowCraft Beauty Academy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>

      <body>
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
