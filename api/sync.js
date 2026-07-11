import { listCalendarBookings } from "./_lib/book.js";
import { syncBookingsToSheet } from "./_lib/sheets.js";

/**
 * Rebuilds the booking sheet from the calendar: upserts every current booking
 * (preserving your manual Paid?/Artist columns) and flips any booking that no
 * longer exists on the calendar to CANCELLED. Calendar is the source of truth.
 */
export async function syncFromCalendar() {
  const bookings = await listCalendarBookings();
  const result = await syncBookingsToSheet(bookings, { markCancellations: true });
  return { calendarEvents: bookings.length, ...result };
}

/**
 * HTTP entry point for the Vercel Cron job (runs on a schedule) and manual
 * triggers. When CRON_SECRET is set, Vercel Cron sends it as a Bearer token;
 * requests without it are rejected so the endpoint can't be abused.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const result = await syncFromCalendar();
    console.log("Calendar → Sheet sync:", result);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
