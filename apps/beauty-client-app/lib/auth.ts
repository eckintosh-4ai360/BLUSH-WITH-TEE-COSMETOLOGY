export { COOKIE_NAME, LOGIN_PATH } from "@blush/shared/const";

/**
 * Sends a signed-out visitor to the sign-in page, remembering where they were
 * headed so they land there after signing in.
 */
export function startLogin(returnTo?: string) {
  if (typeof window === "undefined") return;

  const target = returnTo ?? `${window.location.pathname}${window.location.search}`;
  const next = target && target !== "/login" ? `?next=${encodeURIComponent(target)}` : "";

  window.location.href = `/login${next}`;
}
