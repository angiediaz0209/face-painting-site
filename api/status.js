import crypto from "crypto";
import { getBooking } from "./_lib/book.js";
import { clientStatusHtml } from "./_lib/email.js";

// Same secret + token scheme as api/confirm.js / api/decline.js / api/notify.js
// so a single HMAC of the eventId gates the client's private status link.
const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";

function expectedToken(eventId) {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(eventId)
    .digest("hex")
    .slice(0, 32);
}

function fallbackPage(body) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Face Painting California</title></head>
  <body style="font-family:system-ui,-apple-system,sans-serif;max-width:460px;margin:64px auto;padding:0 24px;text-align:center;color:#1a1a1a;">
  ${body}
  </body></html>`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const eventId = url.searchParams.get("eventId");
  const token = url.searchParams.get("token");

  const send = (code, html) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  };

  if (!eventId || !token) {
    return send(400, fallbackPage("<h2>Incomplete link</h2><p>This status link is missing information.</p>"));
  }

  const expected = expectedToken(eventId);
  const ok =
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    return send(403, fallbackPage("<h2>Invalid link</h2><p>This status link isn't valid.</p>"));
  }

  try {
    const booking = await getBooking(eventId);
    if (!booking) {
      // Event was deleted/declined — treat as cancelled so the client still gets
      // a clear answer instead of an error.
      return send(200, clientStatusHtml({ status: "CANCELLED" }));
    }
    return send(200, clientStatusHtml(booking, { eventId, token }));
  } catch (error) {
    // events.get 404s once a pending booking is declined (deleted).
    if (error?.code === 404 || error?.response?.status === 404) {
      return send(200, clientStatusHtml({ status: "CANCELLED" }));
    }
    console.error("Status error:", error);
    return send(
      500,
      fallbackPage("<h2>Something went wrong</h2><p>We couldn't load your booking status right now. Please text us at (415) 991-9374.</p>")
    );
  }
}
