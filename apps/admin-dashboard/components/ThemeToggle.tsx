"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@blush/ui/theme";

// Theme switch for the dashboard header.
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // Only announced once the stored preference has been read.
      aria-label={
        mounted
          ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`
          : "Switch theme"
      }
      className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white/45 text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      {/* Swapped by CSS, not by state: the theme class is on <html> before the first paint, so. */}
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </button>
  );
}
