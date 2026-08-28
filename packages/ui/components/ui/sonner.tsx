"use client";

import { useTheme } from "../../theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // Sonner paints its own surface, so it has to be told which way the app is
  // rendering. Reading the app's provider rather than the OS keeps a toast
  // from arriving dark on a light page when the two disagree.
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

// Re-exported so apps raise toasts through the design system rather than
// taking their own direct dependency on sonner.
export { toast } from "sonner";

export { Toaster };
