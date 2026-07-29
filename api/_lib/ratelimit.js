// Simple in-memory rate limiting for the public endpoints.
//
// Same approach api/chat.js uses inline: per warm serverless instance, not
// distributed, so it won't stop a large botnet but does throttle a single
// source hammering an endpoint. Back it with Vercel KV / Upstash Redis if that
// ever becomes necessary.

const buckets = new Map(); // `${name}:${ip}` -> timestamp[]

export function getClientIp(req) {
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Records a hit and reports whether this caller is over the limit.
 * @param {string} name - bucket name, so endpoints don't share a budget
 * @param {string} ip
 * @param {{ windowMs?: number, max?: number }} [opts]
 */
export function isRateLimited(name, ip, { windowMs = 60_000, max = 10 } = {}) {
  const now = Date.now();
  const key = `${name}:${ip}`;
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }

  return recent.length > max;
}
