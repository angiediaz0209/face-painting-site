import crypto from "crypto";
import { applyReschedule } from "./book.js";
import { setBookingStatus } from "./sheets.js";
import { sendEmail, clientConfirmationHtml } from "./email.js";

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const BASE_URL = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";

function expectedToken(eventId) {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(eventId)
    .digest("hex")
    .slice(0, 32);
}

function statusUrl(eventId) {
  return `${BASE_URL}/api/status?eventId=${encodeURIComponent(eventId)}&token=${expectedToken(eventId)}`;
}

function page(body) {
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
    res.end(page(html));
  };

  if (!eventId || !token) {
    return send(400, "<h2>Incomplete link</h2><p>This link is missing information.</p>");
  }

  const expected = expectedToken(eventId);
  const ok =
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    return send(403, "<h2>Invalid link</h2><p>This link isn't valid.</p>");
  }

  try {
    const result = await applyReschedule(eventId);
    if (!result) {
      return send(
        200,
        `<h2>No reschedule pending</h2><p>There's no open reschedule request on this booking — it may have already been handled.</p>`
      );
    }

    await Promise.allSettled([
      setBookingStatus(eventId, "CONFIRMED").catch((e) =>
        console.error("Sheet status update failed:", e)
      ),
      result.clientEmail
        ? sendEmail({
            to: result.clientEmail,
            subject: "Your Face Painting California booking has been moved 🎨",
            html: clientConfirmationHtml({
              client: result.clientName,
              date: result.date,
              time: result.time,
              location: result.location,
              quote: result.quote,
              statusUrl: statusUrl(eventId),
            }),
          }).catch((e) => console.error("Client confirmation email failed:", e))
        : Promise.resolve(),
    ]);

    const invite = result.clientEmail
      ? `<p>An updated confirmation was sent to <b>${result.clientEmail}</b>.</p>`
      : `<p>No client email was on file, so no confirmation was sent.</p>`;

    return send(
      200,
      `<h2 style="color:#16a34a;">✅ Date moved</h2>
       <p style="font-size:18px;">Now on <b>${result.date}</b>${result.time ? ` · ${result.time}` : ""}</p>
       ${invite}
       <p style="color:#888;margin-top:24px;">You can close this tab.</p>`
    );
  } catch (error) {
    console.error("Reschedule approve error:", error);
    return send(
      500,
      `<h2>Something went wrong</h2>
       <p>The date couldn't be moved automatically. Open the event in Google Calendar and move it manually.</p>`
    );
  }
}
