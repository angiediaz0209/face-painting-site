import { moveBooking } from "./_lib/book.js";
import { syncBookingsToSheet } from "./_lib/sheets.js";
import { sendEmail, clientConfirmationHtml } from "./_lib/email.js";
import { clientToken } from "./_lib/tokens.js";
import { isAuthed } from "./_lib/owner-auth.js";

const BASE_URL = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";

// The client's status link (see api/_lib/tokens.js for why this is scoped).
function statusToken(eventId) {
  return clientToken(eventId);
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
  if (req.method !== "POST" || !(await isAuthed(req))) {
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
