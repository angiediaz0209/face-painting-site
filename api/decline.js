import { declineBooking } from "./_lib/book.js";
import { setBookingStatus } from "./_lib/sheets.js";
import { sendEmail, clientDeclineHtml } from "./_lib/email.js";
import { ownerToken, verifyToken } from "./_lib/tokens.js";

// Declining deletes the booking, so this is an OWNER-only link.

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

  if (!verifyToken(token, ownerToken(eventId))) {
    return send(403, "<h2>Invalid link</h2><p>This link isn't valid.</p>");
  }

  try {
    const result = await declineBooking(eventId);

    // Await both side effects so they finish before the function is frozen.
    await Promise.allSettled([
      setBookingStatus(eventId, "CANCELLED").catch((e) =>
        console.error("Sheet status update failed:", e)
      ),
      result.clientEmail
        ? sendEmail({
            to: result.clientEmail,
            subject: "About your Face Painting California booking request",
            html: clientDeclineHtml({
              client: result.clientName,
              date: result.date,
            }),
          }).catch((e) => console.error("Client decline email failed:", e))
        : Promise.resolve(),
    ]);

    const who = result.clientName ? ` for ${result.clientName}` : "";
    return send(
      200,
      `<h2 style="color:#b91c1c;">Booking declined</h2>
       <p>The pending booking${who} has been removed from your calendar. No invite was sent to the client.</p>
       <p style="color:#888;margin-top:24px;">You can close this tab.</p>`
    );
  } catch (error) {
    console.error("Decline error:", error);
    return send(
      500,
      `<h2>Something went wrong</h2>
       <p>The booking couldn't be declined automatically. Open it in Google Calendar and delete it manually.</p>`
    );
  }
}
