import crypto from "crypto";
import { requestReschedule } from "./_lib/book.js";
import { setBookingStatus } from "./_lib/sheets.js";
import { sendRescheduleRequestNotification } from "./_lib/notify.js";

// Same token scheme as the rest of the booking links.
const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";

function expectedToken(eventId) {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(eventId)
    .digest("hex")
    .slice(0, 32);
}

function page(body) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Face Painting California</title></head>
  <body style="font-family:system-ui,-apple-system,sans-serif;max-width:460px;margin:64px auto;padding:0 24px;text-align:center;color:#1a1a1a;">
  ${body}
  </body></html>`;
}

// Reads a form/JSON body whether or not the platform pre-parsed it.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    if (raw.trim().startsWith("{")) return JSON.parse(raw);
  } catch {
    /* fall through to urlencoded */
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  const send = (code, html) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page(html));
  };

  if (req.method !== "POST") {
    return send(405, "<h2>Method not allowed</h2>");
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    body = {};
  }

  const eventId = (body.eventId || "").trim();
  const token = (body.token || "").trim();
  const date = (body.date || "").trim();
  const time = (body.time || "").trim();

  if (!eventId || !token || !date) {
    return send(400, "<h2>Incomplete request</h2><p>Please pick a new date and try again.</p>");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return send(400, "<h2>Invalid date</h2><p>Please choose a valid date.</p>");
  }

  const expected = expectedToken(eventId);
  const ok =
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    return send(403, "<h2>Invalid link</h2><p>This request link isn't valid.</p>");
  }

  try {
    const booking = await requestReschedule(eventId, { date, time });

    await Promise.allSettled([
      setBookingStatus(eventId, "RESCHEDULE REQUESTED").catch((e) =>
        console.error("Sheet status update failed:", e)
      ),
      sendRescheduleRequestNotification(booking).catch((e) =>
        console.error("Reschedule notification failed:", e)
      ),
    ]);

    return send(
      200,
      `<h2 style="color:#e8836b;">🔄 Request received</h2>
       <p style="font-size:17px;">Thanks! We've noted your request to move to <b>${date}</b>.</p>
       <p>Our team will text you shortly to confirm the new date. Your original booking stays in place until then.</p>
       <p style="color:#888;margin-top:24px;">You can close this tab.</p>`
    );
  } catch (error) {
    console.error("Reschedule request error:", error);
    return send(
      500,
      `<h2>Something went wrong</h2>
       <p>We couldn't submit your request automatically. Please text us at (415) 991-9374 and we'll help you reschedule.</p>`
    );
  }
}
