import { google } from "googleapis";
import crypto from "crypto";

function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

// Same secret + token scheme as api/confirm.js so the approve link verifies.
const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const BASE_URL = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";

export function approveToken(eventId) {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(eventId)
    .digest("hex")
    .slice(0, 32);
}

function approveUrl(eventId) {
  return `${BASE_URL}/api/confirm?eventId=${encodeURIComponent(
    eventId
  )}&token=${approveToken(eventId)}`;
}

function declineUrl(eventId) {
  return `${BASE_URL}/api/decline?eventId=${encodeURIComponent(
    eventId
  )}&token=${approveToken(eventId)}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// RFC 2047 encoded-word so emoji/unicode in the Subject render correctly.
function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

/**
 * Emails the team when Sky creates a booking. For pending bookings the email
 * includes a one-click "Approve & send invite" button (see api/confirm.js).
 */
export async function sendBookingNotification(bookingInput, bookingResult) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping notification.");
    return;
  }

  const auth = getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const isPending = bookingResult.pending;
  const status = isPending ? "PENDING - Needs Confirmation" : "CONFIRMED";
  const statusEmoji = isPending ? "⚠️" : "✅";
  const subject = `${statusEmoji} New booking: ${bookingInput.clientName}, ${bookingInput.date} (${status})`;

  const rows = [
    ["Client", bookingInput.clientName],
    ["Email", bookingInput.clientEmail],
    ["Phone", bookingInput.clientPhone],
    ["Event", bookingInput.eventType],
    ["Guests", bookingInput.guestCount],
    ["Date", bookingInput.date],
    ["Time", `${bookingInput.startTime} - ${bookingInput.endTime}`],
    ["Location", bookingInput.location],
    ["Quote", bookingInput.quote],
    ["Notes", bookingInput.notes || ""],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;">${k}</td><td style="padding:4px 0;font-weight:600;">${esc(
          v
        )}</td></tr>`
    )
    .join("");

  const approveBlock = isPending
    ? `<div style="margin:20px 0;">
         <a href="${approveUrl(bookingResult.eventId)}"
            style="display:inline-block;background:#16a34a;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;">
           Approve &amp; send invite
         </a>
         <a href="${declineUrl(bookingResult.eventId)}"
            style="display:inline-block;background:#f3f4f6;color:#b91c1c;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-left:10px;border:1px solid #e5e7eb;">
           Decline
         </a>
         <p style="color:#666;font-size:13px;margin-top:10px;">
           <b>Approve</b> confirms the booking, turns the event green, and emails
           ${esc(bookingInput.clientEmail)} their invite.
           <b>Decline</b> removes the pending booking from your calendar (no
           message is sent to the client).
         </p>
       </div>`
    : "";

  const calendarLink = bookingResult.htmlLink
    ? `<p style="margin-top:16px;"><a href="${bookingResult.htmlLink}">Open in Google Calendar</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#faf7f5;">
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">${statusEmoji} ${status}</h2>
      <table style="border-collapse:collapse;font-size:15px;margin-top:12px;">${rows}</table>
      ${approveBlock}
      ${calendarLink}
      <p style="color:#999;font-size:12px;margin-top:24px;">Sky, your Face Painting California assistant</p>
    </div>
  </body></html>`;

  const emailLines = [
    `From: "Sky - Face Painting CA" <${adminEmail}>`,
    `To: ${adminEmail}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ];
  const rawEmail = emailLines.join("\r\n");
  const encodedEmail = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedEmail },
  });

  console.log(`Booking notification sent to ${adminEmail}`);
}
