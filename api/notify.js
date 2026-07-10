import crypto from "crypto";
import { sendEmail, pendingNotificationHtml } from "./email.js";

// Same secret + token scheme as api/confirm.js and api/decline.js so the
// approve/decline links verify.
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

/**
 * Emails the team when Sky creates a booking. Pending bookings include the
 * one-click Approve / Decline buttons (see api/confirm.js, api/decline.js).
 */
export async function sendBookingNotification(bookingInput, bookingResult) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping notification.");
    return;
  }

  const status = bookingResult.pending ? "Pending" : "Confirmed";
  const subject = `${bookingResult.pending ? "⚠️" : "✅"} New booking: ${
    bookingInput.clientName
  }, ${bookingInput.date} (${status})`;

  const html = pendingNotificationHtml(bookingInput, {
    approveUrl: approveUrl(bookingResult.eventId),
    declineUrl: declineUrl(bookingResult.eventId),
    calendarUrl: bookingResult.htmlLink,
  });

  await sendEmail({ to: adminEmail, subject, html });
  console.log(`Booking notification sent to ${adminEmail}`);
}
