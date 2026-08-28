"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@blush/ui/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blush/ui/components/ui/dropdown-menu";

const OPTIONS: { value: Theme; label: string; hint: string; icon: typeof Sun }[] =
  [
    { value: "light", label: "Light", hint: "Bright teal workspace", icon: Sun },
    { value: "dark", label: "Dark", hint: "Low-light workspace", icon: Moon },
    {
      value: "system",
      label: "System",
      hint: "Follow this device",
      icon: Monitor,
    },
  ];

/**
 * Theme picker for the dashboard header.
 *
 * Three choices rather than a plain on/off switch, because "follow the device"
 * is a real preference and a two-state toggle silently throws it away the
 * first time it is pressed.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Only announced once the stored preference has been read; before
          // that the label would claim a theme the page may not be in.
          aria-label={
            mounted
              ? `Theme: ${theme === "system" ? `system (${resolvedTheme})` : theme}`
              : "Theme"
          }
          className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white/45 text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          {/* Swapped by CSS, not by state: the theme class is on <html> before
              the first paint, so the icon is right immediately and stays right
              through hydration. */}
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(option => {
          const selected = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="cursor-pointer gap-2"
            >
              <option.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                <span className="block text-sm leading-tight">
                  {option.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {option.hint}
                </span>
              </span>
              {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
