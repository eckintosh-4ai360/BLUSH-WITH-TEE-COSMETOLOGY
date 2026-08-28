"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** What the user picked. "system" follows the operating system setting. */
export type Theme = "light" | "dark" | "system";
/** What actually gets painted — "system" already resolved against the OS. */
export type ResolvedTheme = "light" | "dark";

const DEFAULT_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Absent when the provider is not switchable, so a locked app cannot flip. */
  toggleTheme?: () => void;
  switchable: boolean;
  /**
   * False during the server render and the first client render, when the
   * stored preference has not been read yet. Anything whose markup differs
   * between themes must wait for this, or React will report a hydration
   * mismatch and repaint.
   */
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
  /** Used until a stored preference is found, and whenever `switchable` is false. */
  defaultTheme?: Theme;
  /** Opt-in: without it the app is pinned to `defaultTheme` and nothing is persisted. */
  switchable?: boolean;
  /** Must match the key given to `ThemeScript`. */
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  // Deliberately not read from localStorage here: the server has no access to
  // it, so seeding state from storage would make the first client render
  // disagree with the server's HTML. `ThemeScript` has already put the right
  // class on <html> before paint, so this catching up a tick later is
  // invisible.
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

  // Only "system" cares what the OS is doing, but the listener is cheap and
  // keeping it always-on avoids a stale reading the moment someone picks it.
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
    // Tells the browser which way to paint the things CSS does not reach:
    // native scrollbars, date pickers, form control chrome.
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
    // From "system" this flips away from whatever the OS is giving right now,
    // which is what someone reaching for a toggle means by "the other one".
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

/**
 * Applies the stored theme before the browser paints.
 *
 * Render this as the first child of <body> in the root layout. React leaves an
 * inline script where it is written, so it runs while the rest of the document
 * is still being parsed — early enough that the page never shows a white flash
 * on its way to dark.
 *
 * The `storageKey` and `defaultTheme` must match the ones given to
 * `ThemeProvider`, otherwise the pre-paint class and the React state disagree.
 */
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
      // The script is built from literals and JSON-encoded props, so there is
      // no user input to escape.
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
