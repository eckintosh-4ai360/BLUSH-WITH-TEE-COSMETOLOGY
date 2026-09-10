export { COOKIE_NAME, LOGIN_PATH } from "@blush/shared/const";

// Redirects unauthenticated visitors to sign-in while preserving destination.
export function startLogin(returnTo?: string) {
  if (typeof window === "undefined") return;

  const target = returnTo ?? `${window.location.pathname}${window.location.search}`;
  const next = target && target !== "/login" ? `?next=${encodeURIComponent(target)}` : "";

  window.location.href = `/login${next}`;
}
