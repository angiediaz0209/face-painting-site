// Tiny in-memory read cache for the owner dashboard.
//
// Every dashboard page navigation was making a fresh, uncached call to Google
// Sheets or Calendar — measured at 400ms to 920ms per page, versus ~1ms for a
// page with no external call. That gap is the "delay switching pages."
//
// This cache is per warm serverless instance, same idea as the Settings cache
// in sheets.js. The honest limitation: each api/*.js file is a SEPARATE
// Vercel function with its own memory, so a write from api/chat.js or
// api/confirm.js can't invalidate a cache sitting in api/owner.js's instance.
// To keep that bounded, TTL stays short (20s) — matching the same tradeoff
// already accepted for isSecondArtistAvailable(). Writes made THROUGH the
// dashboard itself (the large majority — client edits, bookings, gallery,
// reviews) invalidate immediately in owner.js's handleAction, since those run
// in the same instance as the page that reads them next.
const TTL_MS = 20_000;
const store = new Map(); // key -> { at, value }

/** Wraps a zero-argument async read function with a short TTL cache. */
export function cached(key, fetcher) {
  return async () => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = await fetcher();
    store.set(key, { at: Date.now(), value });
    return value;
  };
}

/** Call right after a write so the next read in this instance is fresh. */
export function invalidate(key) {
  store.delete(key);
}
