import { google } from "googleapis";

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

/**
 * Sends an email notification to the admin when Sky creates a booking.
 * Uses Gmail API with the same Google OAuth credentials as Calendar.
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
  const statusEmoji = isPending ? "\u26a0\ufe0f" : "\u2705";

  const subject = `${statusEmoji} New Booking: ${bookingInput.clientName} - ${bookingInput.date} (${status})`;

  const body = [
    `${statusEmoji} ${status} BOOKING`,
    `${"=".repeat(40)}`,
    ``,
    `Client: ${bookingInput.clientName}`,
    `Email: ${bookingInput.clientEmail}`,
    `Phone: ${bookingInput.clientPhone}`,
    ``,
    `Event Type: ${bookingInput.eventType}`,
    `Guests: ${bookingInput.guestCount}`,
    `Date: ${bookingInput.date}`,
    `Time: ${bookingInput.startTime} - ${bookingInput.endTime}`,
    `Location: ${bookingInput.location}`,
    `Quote: ${bookingInput.quote}`,
    bookingInput.notes ? `Notes: ${bookingInput.notes}` : "",
    ``,
    `${"=".repeat(40)}`,
    isPending
      ? `ACTION NEEDED: Check artist availability and text client at ${bookingInput.clientPhone} to confirm.`
      : `Calendar invite has been sent to ${bookingInput.clientEmail}.`,
    ``,
    `Calendar link: ${bookingResult.htmlLink}`,
    ``,
    `-- Sky, your Face Painting California assistant`,
  ]
    .filter(Boolean)
    .join("\n");

  // Build RFC 2822 email with Sky as sender name
  const emailLines = [
    `From: "Sky - Face Painting CA" <${adminEmail}>`,
    `To: ${adminEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ];
  const rawEmail = emailLines.join("\r\n");
  const encodedEmail = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedEmail,
    },
  });

  console.log(`Booking notification sent to ${adminEmail}`);
}
