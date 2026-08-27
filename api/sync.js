import { listCalendarBookings } from "./_lib/book.js";
import { syncBookingsToSheet, getBookingsFromSheet, getQuotesFromSheet } from "./_lib/sheets.js";
import { invalidate } from "./_lib/cache.js";
import { sendEmail, monthlyStatsHtml } from "./_lib/email.js";
import { statsForMonth, currentMonthPacific, shiftMonth, EXTERNAL_REPORTS } from "./_lib/stats.js";

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
/**
 * On the 1st of each month (Pacific), emails the owner last month's numbers.
 * The cron runs daily, so this is a no-op on every other day. Pass ?stats=1
 * (with the secret) to send it on demand.
 */
async function maybeSendMonthlyStats(force = false) {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).slice(8, 10);
  if (day !== "01" && !force) return { sent: false };
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) return { sent: false, reason: "ADMIN_NOTIFICATION_EMAIL not set" };
  invalidate("bookingsFromSheet");
  const [bookings, quotes] = await Promise.all([getBookingsFromSheet(), getQuotesFromSheet()]);
  const ym = shiftMonth(currentMonthPacific(), -1);
  const m = statsForMonth(bookings, quotes, ym);
  const prev = statsForMonth(bookings, quotes, shiftMonth(ym, -1));
  const base = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";
  await sendEmail({
    to,
    subject: `📊 ${m.label}: ${m.quotes} quotes, ${m.bookings} bookings`,
    html: monthlyStatsHtml(m, prev, { dashboardUrl: `${base}/api/owner?view=stats`, reports: EXTERNAL_REPORTS }),
  });
  return { sent: true, month: ym };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const result = await syncFromCalendar();
    console.log("Calendar → Sheet sync:", result);
    const force = new URL(req.url, "http://x").searchParams.get("stats") === "1";
    const stats = await maybeSendMonthlyStats(force).catch((err) => {
      console.error("Monthly stats email failed:", err);
      return { sent: false, error: err.message };
    });
    return res.status(200).json({ ok: true, ...result, monthlyStats: stats });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
