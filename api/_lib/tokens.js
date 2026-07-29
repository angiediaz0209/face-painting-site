import crypto from "crypto";

// Every signed link in the app is an HMAC of some identifier with CRON_SECRET.
//
// The purpose prefix matters. Before it existed, the owner's approve/decline
// links and the client's status link were the same string, so a client who
// received their own status link could swap /api/status for /api/confirm and
// approve or delete their own booking. Prefixing the signed payload means a
// client token simply doesn't verify on an owner route.
//
// Keep these prefixes stable: changing one invalidates every link already sent.
const SECRET = process.env.CRON_SECRET || "dev-confirm-secret";

function sign(payload, length = 32) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex")
    .slice(0, length);
}

/** Owner-only actions: approve, decline, approve/decline a reschedule. */
export function ownerToken(eventId) {
  return sign(`owner:${eventId}`);
}

/** Client-facing: view booking status, request a reschedule. */
export function clientToken(eventId) {
  return sign(`client:${eventId}`);
}

/** Marketing unsubscribe, keyed on the client record rather than an event. */
export function optoutToken(key) {
  return sign(`optout:${key}`);
}

/**
 * Constant-time token comparison, so a wrong token can't be narrowed down by
 * timing. Returns false rather than throwing on a length mismatch, which
 * timingSafeEqual would otherwise do.
 */
export function verifyToken(provided, expected) {
  const a = String(provided || "");
  if (a.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(expected));
}

/** The client's private status page link for a booking. */
export function statusUrlFor(eventId, baseUrl) {
  const base = baseUrl || process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";
  return `${base}/api/status?eventId=${encodeURIComponent(eventId)}&token=${clientToken(eventId)}`;
}
