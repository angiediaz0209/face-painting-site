import crypto from "crypto";
import { moveBooking } from "./_lib/book.js";
import { syncBookingsToSheet } from "./_lib/sheets.js";
import { sendEmail, clientConfirmationHtml } from "./_lib/email.js";

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const OWNER_PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || "";
const BASE_URL = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";

// Must match api/owner.js so the dashboard's session cookie verifies here.
function sessionToken() {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(`owner-session:${OWNER_PASSWORD}`)
    .digest("hex")
    .slice(0, 40);
}

function statusToken(eventId) {
  return crypto.createHmac("sha256", CONFIRM_SECRET).update(eventId).digest("hex").slice(0, 32);
}

function isAuthed(req) {
  if (!OWNER_PASSWORD) return false;
  const raw = req.headers?.cookie || "";
  let cookie = "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === "owner_session") cookie = decodeURIComponent(part.slice(i + 1).trim());
  }
  const expected = sessionToken();
  return cookie.length === expected.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? Object.fromEntries(new URLSearchParams(raw)) : {};
}

function backToDashboard(res, code = 303) {
  res.statusCode = code;
  res.setHeader("Location", "/api/owner");
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "POST" || !isAuthed(req)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<h2>Not authorized</h2>");
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    body = {};
  }

  const eventId = (body.eventId || "").trim();
  const date = (body.date || "").trim();
  const time = (body.time || "").trim();

  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return backToDashboard(res);
  }

  try {
    const booking = await moveBooking(eventId, { date, time });

    await Promise.allSettled([
      syncBookingsToSheet([booking], { markCancellations: false }).catch((e) =>
        console.error("Sheet update failed:", e)
      ),
      booking.status === "CONFIRMED" && booking.email
        ? sendEmail({
            to: booking.email,
            subject: "Your Face Painting California booking has been moved 🎨",
            html: clientConfirmationHtml({
              client: booking.client,
              date: booking.date,
              time: booking.time,
              location: booking.location,
              quote: booking.quote,
              statusUrl: `${BASE_URL}/api/status?eventId=${encodeURIComponent(eventId)}&token=${statusToken(eventId)}`,
            }),
          }).catch((e) => console.error("Client email failed:", e))
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("Manual reschedule error:", error);
  }

  return backToDashboard(res);
}
