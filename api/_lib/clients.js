import {
  getClients as sheetGetClients,
  upsertClient as sheetUpsertClient,
} from "./sheets.js";

// The discount offered in birthday follow-ups. Editable in one place (or via the
// BIRTHDAY_DISCOUNT env var); the owner can still tweak the wording before sending.
export const BIRTHDAY_DISCOUNT = process.env.BIRTHDAY_DISCOUNT || "10% off";
const BUSINESS_PHONE = "415-991-9374";

// How long after a promo send we leave a client alone, and how far ahead we look
// for an upcoming birthday.
const PROMO_COOLDOWN_DAYS = 21;
const DEFAULT_WINDOW_DAYS = 28;

// ── Keys & matching ───────────────────────────────────────────────────────────

// A client is one row across every source. Prefer the phone (last 10 digits) as
// the key since it's the most stable identifier; fall back to a lowercased email.
export function normalizeKey({ phone, email } = {}) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return String(email || "").trim().toLowerCase();
}

function phoneDigits(p) {
  return String(p || "").replace(/\D/g, "").slice(-10);
}

// ── Store wrappers ────────────────────────────────────────────────────────────

export async function getClients() {
  return sheetGetClients();
}

// Computes the dedupe key from the record's phone/email if not supplied.
export async function upsertClient(record, opts) {
  const key = record.key || normalizeKey(record);
  if (!key) return null;
  return sheetUpsertClient({ ...record, key }, opts);
}

// Targeted flag update (opt-out, last-promo-sent) — merges onto the existing row.
export async function setClientFlag(key, flags = {}) {
  if (!key) return null;
  return sheetUpsertClient({ key, ...flags });
}

// ── Recognition (used by Sky) ─────────────────────────────────────────────────

/**
 * Looks a client up by phone/email ONLY (never by name alone, so Sky can't
 * mis-greet a stranger who shares a first name). Returns a compact summary.
 */
export async function lookupClient({ phone, email } = {}) {
  const key = normalizeKey({ phone, email });
  if (!key) return { known: false };

  const clients = await getClients();
  const digits = phoneDigits(phone);
  const em = String(email || "").trim().toLowerCase();

  const match = clients.find(
    (c) =>
      c.key === key ||
      (digits && phoneDigits(c.phone) === digits) ||
      (em && String(c.email || "").trim().toLowerCase() === em)
  );
  if (!match) return { known: false };

  return {
    known: true,
    name: match.name,
    lastEventDate: match.lastEventDate,
    lastEventType: match.lastEventType,
    lastLocation: match.lastLocation,
    totalBookings: match.totalBookings,
  };
}

// ── Birthday follow-ups ───────────────────────────────────────────────────────

function pacificToday(now = new Date()) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d, iso: s };
}

// The MM-DD to anniversary on: an explicit Birthday field wins; otherwise derive
// it from the last event date when that event was a birthday party.
function birthdayMonthDay(client) {
  const b = (client.birthday || "").trim();
  const mb = b.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (mb) return { mm: +mb[1], dd: +mb[2] };
  if (/birth/i.test(client.lastEventType || "")) {
    const d = (client.lastEventDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) return { mm: +d[2], dd: +d[3] };
  }
  return null;
}

// The next time MM-DD comes around on/after today, and how many days away it is.
function nextAnniversary(mm, dd, today) {
  const todayUTC = Date.UTC(today.y, today.m - 1, today.d, 12);
  let anniv = Date.UTC(today.y, mm - 1, dd, 12);
  if (anniv < todayUTC) anniv = Date.UTC(today.y + 1, mm - 1, dd, 12);
  const a = new Date(anniv);
  const iso = `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, "0")}-${String(a.getUTCDate()).padStart(2, "0")}`;
  return { iso, daysUntil: Math.round((anniv - todayUTC) / 86400000) };
}

function daysSince(stamp, today) {
  const m = String(stamp || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return Infinity;
  const then = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  return Math.round((Date.UTC(today.y, today.m - 1, today.d, 12) - then) / 86400000);
}

// A tel-scheme SMS deep link with the message pre-filled (opens Messages on
// iOS/Android). "?&body=" is the cross-platform form that both honor.
export function smsHref(phone, body) {
  const raw = String(phone || "").replace(/[^\d+]/g, "");
  const num = raw.startsWith("+") ? raw : raw.length === 10 ? `+1${raw}` : raw ? `+${raw}` : "";
  return `sms:${num}?&body=${encodeURIComponent(body)}`;
}

// A friendly first name for greetings. Skips a leading article so a name like
// "The Chen Family" greets as "Chen" instead of "The".
export function firstName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length > 1 && /^(the|a|an)$/i.test(parts[0])) return parts[1];
  return parts[0] || "there";
}

/** The ready-to-send text the owner copies or taps to send. Brand voice: no dashes. */
export function suggestedFollowupText(client, discount = BIRTHDAY_DISCOUNT) {
  const first = firstName(client.name);
  const occasion = /birth/i.test(client.lastEventType || "") ? "birthday party" : "event";
  return (
    `Hi ${first}! It's Face Painting California. ` +
    `We had so much fun at your ${occasion} last time and would love to paint for you again. ` +
    `As a returning family here's ${discount} on your next booking. ` +
    `Text us at ${BUSINESS_PHONE} to pick a date!`
  );
}

/**
 * Returns the clients with a birthday coming up within `withinDays`, soonest
 * first, each with the next-birthday date and a ready-to-send text + sms link.
 * Excludes opted-out clients, anyone messaged a promo in the last few weeks, and
 * (via `excludeKeys`) clients who already have a future booking on the books.
 *
 * `now` and `excludeKeys` are injectable so this stays pure and testable.
 */
export async function listBirthdayFollowups({
  withinDays = DEFAULT_WINDOW_DAYS,
  now = new Date(),
  excludeKeys = new Set(),
  discount = BIRTHDAY_DISCOUNT,
  clients = null,
} = {}) {
  const today = pacificToday(now);
  const rows = clients || (await getClients());

  const out = [];
  for (const c of rows) {
    if (c.optOut) continue;
    if (excludeKeys.has(c.key)) continue;
    if (daysSince(c.lastPromoSent, today) < PROMO_COOLDOWN_DAYS) continue;

    const md = birthdayMonthDay(c);
    if (!md) continue;

    const { iso, daysUntil } = nextAnniversary(md.mm, md.dd, today);
    if (daysUntil < 0 || daysUntil > withinDays) continue;

    const suggestedText = suggestedFollowupText(c, discount);
    out.push({
      ...c,
      nextBirthday: iso,
      daysUntil,
      suggestedText,
      smsHref: smsHref(c.phone, suggestedText),
    });
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return out;
}
