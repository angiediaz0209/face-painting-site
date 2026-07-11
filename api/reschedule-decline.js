import crypto from "crypto";
import { clearReschedule } from "./_lib/book.js";
import { setBookingStatus } from "./_lib/sheets.js";
import { sendEmail, rescheduleKeptHtml } from "./_lib/email.js";

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
    const result = await clearReschedule(eventId);

    await Promise.allSettled([
      setBookingStatus(eventId, "CONFIRMED").catch((e) =>
        console.error("Sheet status update failed:", e)
      ),
      result.clientEmail
        ? sendEmail({
            to: result.clientEmail,
            subject: "About your Face Painting California reschedule request",
            html: rescheduleKeptHtml({
              client: result.clientName,
              date: result.date,
              proposedDate: result.proposedDate,
            }),
          }).catch((e) => console.error("Client note email failed:", e))
        : Promise.resolve(),
    ]);

    return send(
      200,
      `<h2>Kept current date</h2>
       <p>The reschedule request was cleared. The booking stays on <b>${result.date}</b>${
        result.clientEmail ? `, and ${result.clientName || "the client"} was let know` : ""
      }.</p>
       <p style="color:#888;margin-top:24px;">You can close this tab.</p>`
    );
  } catch (error) {
    console.error("Reschedule decline error:", error);
    return send(
      500,
      `<h2>Something went wrong</h2>
       <p>The request couldn't be cleared automatically. Open the event in Google Calendar to adjust it manually.</p>`
    );
  }
}
