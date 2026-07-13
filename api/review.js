import crypto from "crypto";
import { addReview, getReviews } from "./_lib/sheets.js";

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";

// A one-time review link is tokenized per client key (their normalized phone/
// email). The link itself validates; "one-time" is enforced by refusing to save
// a second review for a key that already has a non-rejected one.
export function reviewToken(key) {
  return crypto.createHmac("sha256", CONFIRM_SECRET).update(`review:${key}`).digest("hex").slice(0, 32);
}
function validReviewToken(key, token) {
  if (!key || !token) return false;
  const expected = reviewToken(key);
  return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
async function alreadyReviewed(key) {
  try {
    const reviews = await getReviews();
    return reviews.some((r) => r.key === key && r.status !== "rejected");
  } catch {
    return false;
  }
}

// Light in-memory throttle (per warm instance) so the public form can't be
// hammered. Not distributed, but enough to blunt a single spammer.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 6;
const buckets = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.every((t) => now - t > RATE_WINDOW_MS)) buckets.delete(k);
  return recent.length > RATE_MAX;
}
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  return (xff ? xff.split(",")[0].trim() : req.socket?.remoteAddress) || "unknown";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function readForm(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? Object.fromEntries(new URLSearchParams(raw)) : {};
}

// ── Branded form page ─────────────────────────────────────────────────────────
const CORAL = "#b0542e";
function page(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Leave a review · Face Painting California</title>
  <style>
    :root{color-scheme:light}
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f6f0e4;color:#2b2a28}
    .wrap{max-width:460px;margin:0 auto;padding:40px 20px 60px}
    .card{background:#fff;border:1px solid #efe6d6;border-radius:20px;padding:26px 24px}
    h1{font-family:Georgia,'Times New Roman',serif;font-size:26px;margin:0 0 6px}
    .sub{color:#a29a8b;font-size:15px;margin:0 0 20px}
    label{display:block;font-size:14px;font-weight:700;color:#7c7566;margin:14px 0 6px}
    input[type=text],textarea{width:100%;padding:12px;border:1px solid #e7ddcc;border-radius:12px;font-size:16px;background:#fdfbf6;font-family:inherit}
    textarea{resize:vertical}
    .stars{display:inline-flex;flex-direction:row-reverse;justify-content:flex-start}
    .stars input{position:absolute;opacity:0;width:0;height:0}
    .stars label{font-size:38px;color:#e3dccd;cursor:pointer;padding:0 3px;margin:0}
    .stars input:checked ~ label,.stars label:hover,.stars label:hover ~ label{color:#f5b301}
    .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
    .btn{margin-top:22px;width:100%;background:${CORAL};color:#fff;border:none;border-radius:26px;padding:14px;font-size:16px;font-weight:700;cursor:pointer}
    .foot{text-align:center;color:#b3ab9c;font-size:13px;margin-top:18px}
  </style></head><body><div class="wrap"><div class="card">${inner}</div>
  <div class="foot">Face Painting California 🎨</div></div></body></html>`;
}

function alreadyThanks() {
  return `<h1>Thanks again! 🎨</h1><p class="sub">Looks like you've already left us a review — we really appreciate it! If you'd like to change it, just text us at (415) 991-9374.</p>`;
}

function formInner(prefill = {}) {
  const name = esc(prefill.name || "");
  const event = esc(prefill.event || "");
  const hidden =
    prefill.key && prefill.token
      ? `<input type="hidden" name="rk" value="${esc(prefill.key)}"><input type="hidden" name="token" value="${esc(prefill.token)}">`
      : "";
  const stars = [5, 4, 3, 2, 1]
    .map((n) => `<input type="radio" id="s${n}" name="rating" value="${n}"${n === 5 ? " checked" : ""}><label for="s${n}" title="${n} star${n === 1 ? "" : "s"}">★</label>`)
    .join("");
  return `<h1>Leave a review</h1>
    <p class="sub">We'd love to hear how your face painting went! It only takes a moment.</p>
    <form method="POST" action="/api/review">
      ${hidden}
      <label>Your rating</label>
      <div class="stars">${stars}</div>
      <label for="name">Your name</label>
      <input type="text" id="name" name="name" maxlength="80" value="${name}" placeholder="e.g. Sarah M." required>
      <label for="event">Event (optional)</label>
      <input type="text" id="event" name="event" maxlength="60" value="${event}" placeholder="e.g. Birthday Party">
      <label for="text">Your review</label>
      <textarea id="text" name="text" rows="5" maxlength="1000" placeholder="Tell us about your experience…" required></textarea>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">Submit review</button>
    </form>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");

  // Public JSON feed of APPROVED reviews, consumed by the marketing site.
  if (req.method === "GET" && url.searchParams.get("list")) {
    try {
      const reviews = await getReviews();
      const approved = reviews
        .filter((r) => r.status === "approved")
        .map((r) => ({ name: r.name, rating: r.rating, event: r.eventType, text: r.text }));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.end(JSON.stringify(approved));
    } catch (e) {
      console.error("Review list error:", e);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end("[]");
    }
  }

  const sendPage = (code, inner) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page(inner));
  };

  if (req.method === "GET") {
    const rk = url.searchParams.get("rk");
    const token = url.searchParams.get("token");
    const prefill = { name: url.searchParams.get("name"), event: url.searchParams.get("event") };
    if (rk) {
      if (!validReviewToken(rk, token)) {
        return sendPage(403, `<h1>Invalid link</h1><p class="sub">This review link isn't valid or has expired. Please text us at (415) 991-9374.</p>`);
      }
      if (await alreadyReviewed(rk)) return sendPage(200, alreadyThanks());
      return sendPage(200, formInner({ ...prefill, key: rk, token }));
    }
    return sendPage(200, formInner(prefill));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  let body;
  try {
    body = await readForm(req);
  } catch {
    body = {};
  }

  // Honeypot: real users leave this blank. Pretend success so bots don't retry.
  if ((body.website || "").trim()) {
    return sendPage(200, `<h1>Thank you! 🎨</h1><p class="sub">Your review has been received.</p>`);
  }
  if (limited(clientIp(req))) {
    return sendPage(429, `<h1>One moment</h1><p class="sub">You've submitted a few times just now — please try again in a minute.</p>`);
  }

  // One-time per-client link: validate the token and enforce a single review.
  const rk = (body.rk || "").trim();
  const token = (body.token || "").trim();
  let key = "";
  if (rk) {
    if (!validReviewToken(rk, token)) {
      return sendPage(403, `<h1>Invalid link</h1><p class="sub">This review link isn't valid. Please text us at (415) 991-9374.</p>`);
    }
    if (await alreadyReviewed(rk)) return sendPage(200, alreadyThanks());
    key = rk;
  }

  const name = (body.name || "").trim().slice(0, 80);
  const text = (body.text || "").trim().slice(0, 1000);
  const eventType = (body.event || "").trim().slice(0, 60);
  const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 0));

  if (!name || text.length < 3 || !rating) {
    return sendPage(400, `<h1>Almost there</h1><p class="sub">Please add your name, a rating, and a few words.</p>` + formInner({ name, event: eventType, key: rk, token }));
  }

  try {
    await addReview({ name, rating, eventType, text, key });
  } catch (e) {
    console.error("Review submit error:", e);
    return sendPage(500, `<h1>Something went wrong</h1><p class="sub">We couldn't save your review. Please try again, or text us at (415) 991-9374.</p>`);
  }

  return sendPage(
    200,
    `<h1>Thank you! 🎨</h1><p class="sub">Your review has been submitted and will appear on our site once approved. We appreciate you!</p>`
  );
}
