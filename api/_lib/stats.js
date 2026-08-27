// Monthly business numbers, computed from the Sheet.
//
// Sources:
//   Quotes tab  — one row per price card Sky showed (api/chat.js)
//   Sheet1      — bookings; "Booked On" is when the request came in, "Date" is
//                 the event date, "Quote" the agreed price.
//
// Definitions (kept deliberately simple so the numbers are explainable):
//   quotes      price cards shown that month
//   bookings    booking requests made that month (Booked On), excluding cancelled
//   conversion  bookings ÷ quotes
//   revenue     sum of Quote for non-cancelled bookings whose EVENT is that month
//   booked $    sum of Quote for bookings REQUESTED that month (pipeline value)
//
// GA4 and Search Console hold the traffic numbers; they're linked from the
// Stats page rather than pulled in, which would need a service account.

const SITE_URL = "https://face-painting-site.vercel.app/";

export const EXTERNAL_REPORTS = [
  {
    title: "Visitors & where they came from",
    sub: "GA4 · Reports snapshot",
    href: "https://analytics.google.com/analytics/web/#/reports/intelligenthome",
  },
  {
    title: "Funnel: chats → quotes → bookings",
    sub: "GA4 · Events (chat_started, quote_shown, booking_submitted)",
    href: "https://analytics.google.com/analytics/web/#/reports/explorer?params=_u..nav%3Dmaui&r=events-overview",
  },
  {
    title: "What people searched to find you",
    sub: "Search Console · Performance",
    href: `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(SITE_URL)}`,
  },
];

/** "MM/DD/YYYY, hh:mm AM" or "YYYY-MM-DD" → "YYYY-MM" (or "" if unparseable). */
export function monthOf(stamp) {
  const s = String(stamp || "");
  let m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}`;
  return "";
}

export function money(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;
  return n;
}

export function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function currentMonthPacific() {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
  return d.slice(0, 7);
}

export function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Numbers for one month. */
export function statsForMonth(bookings, quotes, ym) {
  const q = quotes.filter((x) => monthOf(x.shownOn) === ym);
  const live = bookings.filter((b) => b.status !== "CANCELLED");
  const requested = live.filter((b) => monthOf(b.bookedOn) === ym);
  const events = live.filter((b) => monthOf(b.date) === ym);
  const cancelled = bookings.filter((b) => b.status === "CANCELLED" && monthOf(b.bookedOn) === ym);

  const quoteTotal = q.reduce((s, x) => s + x.total, 0);
  const pipeline = requested.reduce((s, b) => s + money(b.quote), 0);
  const revenue = events.reduce((s, b) => s + money(b.quote), 0);

  return {
    ym,
    label: monthLabel(ym),
    quotes: q.length,
    avgQuote: q.length ? quoteTotal / q.length : 0,
    bookings: requested.length,
    conversion: q.length ? requested.length / q.length : null,
    pipeline,
    events: events.length,
    revenue,
    cancelled: cancelled.length,
    topCities: topN(q.map((x) => x.city)),
    topEventTypes: topN(requested.map((b) => b.eventType)),
  };
}

function topN(values, n = 3) {
  const counts = new Map();
  for (const v of values) {
    const k = String(v || "").trim();
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** All-time totals, for context. */
export function statsAllTime(bookings, quotes) {
  const live = bookings.filter((b) => b.status !== "CANCELLED");
  return {
    quotes: quotes.length,
    bookings: live.length,
    conversion: quotes.length ? live.length / quotes.length : null,
    revenue: live.reduce((s, b) => s + money(b.quote), 0),
  };
}
