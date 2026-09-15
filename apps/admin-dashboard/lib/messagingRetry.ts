const DEFAULT_INTERVAL_MINUTES = 5;

// How often the server retries messages that did not send. MESSAGING_RETRY_INTERVAL_MINUTES=0
// switches the timer off, for a deployment that calls /api/messaging/flush from a scheduler.
export function retryIntervalMinutes(value = process.env.MESSAGING_RETRY_INTERVAL_MINUTES): number {
  if (value === undefined || value.trim() === "") return DEFAULT_INTERVAL_MINUTES;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_INTERVAL_MINUTES;
}

let started = false;

export function startMessageRetries(): void {
  const minutes = retryIntervalMinutes();
  if (started || minutes === 0) return;
  started = true;

  let running = false;
  const tick = async () => {
    // A slow provider can make one pass outlast the interval; the next waits for it.
    if (running) return;
    running = true;
    try {
      // Loaded here so the interval logic above stays free of the database.
      const [{ getDb }, { flush }] = await Promise.all([
        import("@blush/db"),
        import("@blush/api/messaging-flush"),
      ]);
      const db = await getDb();
      if (db) await flush(db, 100);
    } catch (error) {
      console.error("[Messaging] Retry pass failed:", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), minutes * 60_000);
  // Never the reason the process stays alive.
  timer.unref?.();
}
