"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Selected theme setting or system preference.
export type Theme = "light" | "dark" | "system";
// Resolved theme applied to document.
export type ResolvedTheme = "light" | "dark";

const DEFAULT_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  // Theme setter callback for switchable themes.
  toggleTheme?: () => void;
  switchable: boolean;
  // Flag indicating client mount completion.
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  // Default fallback theme.
  defaultTheme?: Theme;
  // Enables user theme switching.
  switchable?: boolean;
  // LocalStorage key for persisting theme.
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  // Read theme preference after initial mount to prevent hydration mismatch.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [systemPreference, setSystemPreference] =
    useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSystemPreference(systemTheme());
    if (!switchable) {
      setMounted(true);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (isTheme(stored)) setThemeState(stored);
    } catch {
      // Private-browsing modes throw on access; the default is a fine answer.
    }
    setMounted(true);
  }, [switchable, storageKey]);

  // Listen for operating system theme changes.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPreference(event.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // A second tab changing the preference should not leave this one behind.
  useEffect(() => {
    if (!switchable) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [switchable, storageKey, defaultTheme]);

  const resolvedTheme: ResolvedTheme = switchable
    ? theme === "system"
      ? systemPreference
      : theme
    : resolve(defaultTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    // Set color-scheme to theme native UI controls.
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!switchable) return;
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Preference is lost on reload, but the session still works.
      }
    },
    [switchable, storageKey]
  );

  const toggleTheme = useCallback(() => {
    // Toggle theme between light and dark modes.
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [setTheme, resolvedTheme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme: switchable ? theme : defaultTheme,
      resolvedTheme,
      setTheme,
      toggleTheme: switchable ? toggleTheme : undefined,
      switchable,
      mounted,
    }),
    [
      theme,
      defaultTheme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      switchable,
      mounted,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

// Inline script preventing theme flash before initial render.
export function ThemeScript({
  defaultTheme = "system",
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const script = `(function(){try{var d=document.documentElement;var s=localStorage.getItem(${JSON.stringify(
    storageKey
  )});var t=(s==="light"||s==="dark"||s==="system")?s:${JSON.stringify(
    defaultTheme
  )};if(t==="system"){t=window.matchMedia("${DARK_QUERY}").matches?"dark":"light"}d.classList.toggle("dark",t==="dark");d.style.colorScheme=t}catch(e){}})()`;

  return (
    <script
      // Pre-rendered script injection with encoded props.
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
