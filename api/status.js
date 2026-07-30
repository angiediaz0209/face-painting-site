import { getBooking, updateBookingLocation } from "./_lib/book.js";
import { clientStatusHtml, receiptHtml, sendEmail } from "./_lib/email.js";
import { setClientFlag } from "./_lib/clients.js";
import { clientToken, optoutToken, verifyToken } from "./_lib/tokens.js";
import { syncBookingsToSheet } from "./_lib/sheets.js";

// This page is the CLIENT's view of their booking, so it verifies a client
// token. Deliberately different from the owner token on the approve/decline
// links: holding a status link must not let anyone approve or delete a booking.

// Re-exported because api/owner.js builds unsubscribe links from it.
export { optoutToken };

// Reads a form/JSON body whether or not the platform pre-parsed it.
// Same helper as api/reschedule-request.js; both take posts from emailed forms.
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

  // ── Client sends or updates the event address ───────────────────────────────
  // Plenty of clients book before they've settled on a park or venue, so the
  // address is optional at booking time and this is how it reaches us later.
  // Lives here rather than in its own file because the Vercel Hobby plan caps
  // the project at 12 functions and we're at the limit.
  if (url.searchParams.get("action") === "address") {
    if (req.method !== "POST") {
      return send(405, fallbackPage("<h2>Not allowed</h2><p>Please use the form on your booking page.</p>"));
    }

    const body = await readBody(req);
    const id = (body.eventId || "").trim();
    const tok = (body.token || "").trim();
    const location = (body.location || "").trim().slice(0, 300);

    if (!id || !verifyToken(tok, clientToken(id))) {
      return send(403, fallbackPage("<h2>Invalid link</h2><p>This link isn't valid.</p>"));
    }
    if (!location) {
      return send(400, fallbackPage("<h2>Nothing to save</h2><p>Please enter the address or venue and try again.</p>"));
    }

    try {
      const booking = await updateBookingLocation(id, location);

      // Tell the team, and keep the tracker in step. Neither is worth failing
      // the client's update over.
      await Promise.allSettled([
        syncBookingsToSheet([booking], { markCancellations: false }).catch((e) =>
          console.error("Sheet sync (address) failed:", e)
        ),
        process.env.ADMIN_NOTIFICATION_EMAIL
          ? sendEmail({
              to: process.env.ADMIN_NOTIFICATION_EMAIL,
              subject: `📍 Address for ${booking?.client || "a booking"}, ${booking?.date || ""}`,
              html: `<p><b>${booking?.client || "A client"}</b> sent the location for their ${booking?.date || ""} event:</p>
                     <p style="font-size:17px;"><b>${location.replace(/[<>&]/g, "")}</b></p>
                     <p>It's on the calendar event now.</p>`,
            }).catch((e) => console.error("Address notification failed:", e))
          : Promise.resolve(),
      ]);

      return send(
        200,
        fallbackPage(
          `<h2 style="color:#4e9d63;">Got it, thank you!</h2>
           <p>We've added <b>${location.replace(/[<>&]/g, "")}</b> to your booking and let the team know.</p>
           <p style="color:#888;margin-top:24px;">You can close this tab.</p>`
        )
      );
    } catch (error) {
      console.error("Address update error:", error);
      return send(
        500,
        fallbackPage("<h2>Something went wrong</h2><p>We couldn't save that. Please text us at (415) 991-9374.</p>")
      );
    }
  }

  // ── Marketing unsubscribe (from the birthday promo email) ───────────────────
  // GET shows a confirm page with a POST button, so an email link-scanner can't
  // silently opt someone out; POST performs the opt-out.
  if (url.searchParams.get("action") === "optout") {
    const key = url.searchParams.get("key") || "";
    const otoken = url.searchParams.get("token") || "";
    if (!key || !verifyToken(otoken, optoutToken(key))) {
      return send(403, fallbackPage("<h2>Invalid link</h2><p>This unsubscribe link isn't valid.</p>"));
    }
    if (req.method !== "POST") {
      const qs = `action=optout&key=${encodeURIComponent(key)}&token=${encodeURIComponent(otoken)}`;
      return send(
        200,
        fallbackPage(
          `<h2>Unsubscribe from offers?</h2>
           <p>You'll still get confirmations for events you book, just no promotions.</p>
           <form method="POST" action="/api/status?${qs}">
             <button type="submit" style="background:#ef6c4d;color:#fff;border:none;padding:13px 26px;border-radius:24px;font-weight:700;font-size:15px;cursor:pointer;">Yes, unsubscribe</button>
           </form>`
        )
      );
    }
    try {
      await setClientFlag(key, { optOut: true });
      return send(
        200,
        fallbackPage(
          "<h2>You're unsubscribed</h2><p>You won't receive promotional emails from Face Painting California. You'll still get confirmations for events you book. Changed your mind? Text us at (415) 991-9374.</p>"
        )
      );
    } catch (error) {
      console.error("Opt-out error:", error);
      return send(
        500,
        fallbackPage("<h2>Something went wrong</h2><p>We couldn't update your preferences. Please text us at (415) 991-9374.</p>")
      );
    }
  }

  if (!eventId || !token) {
    return send(400, fallbackPage("<h2>Incomplete link</h2><p>This status link is missing information.</p>"));
  }

  if (!verifyToken(token, clientToken(eventId))) {
    return send(403, fallbackPage("<h2>Invalid link</h2><p>This status link isn't valid.</p>"));
  }

  // Printable receipt, for schools and companies that need one on file.
  // Reuses the same eventId/token check above — a client token that can view
  // the status page can also print its receipt, nothing more.
  const wantsReceipt = url.searchParams.get("action") === "receipt";

  try {
    const booking = await getBooking(eventId);
    if (!booking) {
      // Event was deleted/declined — treat as cancelled so the client still gets
      // a clear answer instead of an error.
      return send(200, wantsReceipt ? receiptHtml({ status: "CANCELLED" }) : clientStatusHtml({ status: "CANCELLED" }));
    }
    return send(200, wantsReceipt ? receiptHtml(booking) : clientStatusHtml(booking, { eventId, token }));
  } catch (error) {
    // events.get 404s once a pending booking is declined (deleted).
    if (error?.code === 404 || error?.response?.status === 404) {
      return send(200, wantsReceipt ? receiptHtml({ status: "CANCELLED" }) : clientStatusHtml({ status: "CANCELLED" }));
    }
    console.error("Status error:", error);
    return send(
      500,
      fallbackPage("<h2>Something went wrong</h2><p>We couldn't load your booking status right now. Please text us at (415) 991-9374.</p>")
    );
  }
}
