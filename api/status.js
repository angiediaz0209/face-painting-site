import { getBooking } from "./_lib/book.js";
import { clientStatusHtml } from "./_lib/email.js";
import { setClientFlag } from "./_lib/clients.js";
import { clientToken, optoutToken, verifyToken } from "./_lib/tokens.js";

// This page is the CLIENT's view of their booking, so it verifies a client
// token. Deliberately different from the owner token on the approve/decline
// links: holding a status link must not let anyone approve or delete a booking.

// Re-exported because api/owner.js builds unsubscribe links from it.
export { optoutToken };

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
