// Runs once when the server starts.
export async function register() {
  // The retry timer needs a long-running Node server. On Vercel each request may get a fresh,
  // short-lived instance, so there a scheduler calls /api/messaging/flush instead.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  if (process.env.NODE_ENV !== "production") return;

  const { startMessageRetries } = await import("./lib/messagingRetry");
  startMessageRetries();
}
