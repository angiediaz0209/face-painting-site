import crypto from "crypto";
import { invalidate } from "./_lib/cache.js";
import { listCalendarBookings, createOwnerBooking, updateBooking } from "./_lib/book.js";
import {
  syncBookingsToSheet,
  getBookingsFromSheet,
  getReviews,
  getConversations,
  isSecondArtistAvailable,
  setSetting,
  SECOND_ARTIST_KEY,
  setReviewStatus,
  getGallery,
  addGalleryImage,
  removeGalleryImage,
} from "./_lib/sheets.js";
import { fmtTimeRange, birthdayPromoHtml, sendEmail } from "./_lib/email.js";
import {
  getClients,
  upsertClient,
  setClientFlag,
  listBirthdayFollowups,
  normalizeKey,
  smsHref,
  firstName,
  BIRTHDAY_DISCOUNT,
} from "./_lib/clients.js";
import { optoutToken } from "./status.js";
import { reviewToken } from "./review.js";
import { ownerToken } from "./_lib/tokens.js";

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const OWNER_PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || "";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "";

// Per-event token for the dashboard's one-click action links. These hit the
// same owner-only endpoints as the email buttons (confirm, decline, reschedule),
// so they must be signed with the OWNER token — see api/_lib/tokens.js.
const eventToken = ownerToken;

// Session token derived from the password — stored in an HttpOnly cookie so the
// plaintext password never lives in the browser.
function sessionToken() {
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(`owner-session:${OWNER_PASSWORD}`)
    .digest("hex")
    .slice(0, 40);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers?.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  if (!OWNER_PASSWORD) return false;
  const cookie = parseCookies(req).owner_session || "";
  const expected = sessionToken();
  return (
    cookie.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
  );
}

function passwordMatches(input) {
  if (!OWNER_PASSWORD || !input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(OWNER_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return Object.fromEntries(new URLSearchParams(raw));
}

// ── Rendering ────────────────────────────────────────────────────────────────

function shellPage(title, body, script = "") {
  const head = `<meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Bookings">
    <meta name="theme-color" content="#f6f0e4">
    <meta name="format-detection" content="telephone=no">
    <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20180%20180%22%3E%3Crect%20width%3D%22180%22%20height%3D%22180%22%20rx%3D%2240%22%20fill%3D%22%23b0542e%22%2F%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%2295%22%20r%3D%2246%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2272%22%20cy%3D%2279%22%20r%3D%227.5%22%20fill%3D%22%23e8836b%22%2F%3E%3Ccircle%20cx%3D%22107%22%20cy%3D%2277%22%20r%3D%227.5%22%20fill%3D%22%235f8c6b%22%2F%3E%3Ccircle%20cx%3D%22115%22%20cy%3D%22103%22%20r%3D%227.5%22%20fill%3D%22%23e2a33a%22%2F%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%22113%22%20r%3D%227.5%22%20fill%3D%22%237a6cbf%22%2F%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%2295%22%20r%3D%229%22%20fill%3D%22%23f6f0e4%22%2F%3E%3C%2Fsvg%3E">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20180%20180%22%3E%3Crect%20width%3D%22180%22%20height%3D%22180%22%20rx%3D%2240%22%20fill%3D%22%23b0542e%22%2F%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%2295%22%20r%3D%2246%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2272%22%20cy%3D%2279%22%20r%3D%227.5%22%20fill%3D%22%23e8836b%22%2F%3E%3Ccircle%20cx%3D%22107%22%20cy%3D%2277%22%20r%3D%227.5%22%20fill%3D%22%235f8c6b%22%2F%3E%3Ccircle%20cx%3D%22115%22%20cy%3D%22103%22%20r%3D%227.5%22%20fill%3D%22%23e2a33a%22%2F%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%22113%22%20r%3D%227.5%22%20fill%3D%22%237a6cbf%22%2F%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%2295%22%20r%3D%229%22%20fill%3D%22%23f6f0e4%22%2F%3E%3C%2Fsvg%3E">
    <link rel="stylesheet" href="/owner-dashboard.css?v=1">
    <title>${title}</title>`;
  return `<!doctype html><html><head>${head}</head><body>${body}${script}</body></html>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function loginPage(error) {
  return shellPage(
    "Owner · Face Painting CA",
    `<div class="login">
      <h1>Bookings</h1>
      <p class="sub">Enter the owner password to continue.</p>
      <form method="POST" action="/api/owner">
        <input type="password" name="password" placeholder="Password" autofocus required>
        <button class="btn btn-add" type="submit">Sign in</button>
        ${error ? `<div class="err">${error}</div>` : ""}
      </form>
    </div>`
  );
}

function badge(status) {
  const map = {
    CONFIRMED: ["b-confirmed", "Confirmed"],
    PENDING: ["b-pending", "Pending"],
    CANCELLED: ["b-cancelled", "Cancelled"],
    "RESCHEDULE REQUESTED": ["b-reschedule", "Reschedule?"],
  };
  const [cls, label] = map[status] || ["b-pending", status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function link(path, eventId, label, cls) {
  const url = `${path}?eventId=${encodeURIComponent(eventId)}&token=${eventToken(eventId)}`;
  return `<a class="btn ${cls}" href="${url}">${label}</a>`;
}

// "2026-07-12" -> "Sun, Jul 12"
function shortDate(iso) {
  const [Y, M, D] = (iso || "").split("-").map(Number);
  if (!Y) return "";
  return new Date(Date.UTC(Y, M - 1, D, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function shortWhen(b) {
  const d = shortDate(b.date);
  const t = b.time ? fmtTimeRange(b.time) : "";
  return t ? `${d} · ${t}` : d;
}

// Shared booking fields for the add + edit forms. Pre-fills from `b` when editing.
function bookingFields(b = {}) {
  const v = (x) => esc(x || "");
  const parts = (b.time || "").split(/\s*[-–]\s*/);
  return `
    <input class="bin" type="text" name="clientName" placeholder="Client name *" value="${v(b.client)}" required>
    <input class="bin" type="email" name="clientEmail" placeholder="Email" value="${v(b.email)}">
    <input class="bin" type="tel" name="clientPhone" placeholder="Phone" value="${v(b.phone)}">
    <input class="bin" type="text" name="eventType" placeholder="Event type (e.g. Birthday)" value="${v(b.eventType)}">
    <input class="bin" type="text" name="guestCount" placeholder="Guests" value="${v(b.guests)}">
    <div class="form-row">
      <input type="date" name="date" value="${v(b.date)}" required>
      <input type="time" name="startTime" value="${v(parts[0] || "")}" required>
      <input type="time" name="endTime" value="${v(parts[1] || "")}">
    </div>
    <input class="bin" type="text" name="location" placeholder="Location / address" value="${v(b.location)}">
    <input class="bin" type="text" name="quote" placeholder="Quote (e.g. $300)" value="${v(b.quote)}">
    <textarea class="bin" name="notes" placeholder="Notes" rows="2">${v(b.notes)}</textarea>`;
}

function rescheduleFormInner(b) {
  return `<form method="POST" action="/api/reschedule-manual" class="bform">
      <input type="hidden" name="eventId" value="${esc(b.eventId)}">
      <div class="form-row">
        <input type="date" name="date" required>
        <input type="time" name="time" placeholder="Start time">
      </div>
      <button class="btn btn-confirm" type="submit">Move booking</button>
    </form>`;
}

// Read-only "extra info" drawer: the booking fields not shown on the card face
// (phone, email, event type, guests, quote, notes) plus a Google Calendar link.
function detailsInner(b) {
  const rows = [
    ["Phone", b.phone, (v) => `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ""))}">${esc(v)}</a>`],
    ["Email", b.email, (v) => `<a href="mailto:${esc(v)}">${esc(v)}</a>`],
    ["Event", b.eventType],
    ["Guests", b.guests],
    ["Quote", b.quote],
    ["Notes", b.notes],
  ].filter(([, v]) => v && String(v).trim());

  const gcal = b.htmlLink
    ? `<a class="gcal" href="${esc(b.htmlLink)}" target="_blank" rel="noopener">📅 Open in Google Calendar</a>`
    : "";

  if (!rows.length) {
    return `<div class="details"><div class="dempty">No extra details on file.</div>${gcal}</div>`;
  }
  const list = rows
    .map(([k, v, fmt]) => `<div class="drow"><span class="dk">${k}</span><span class="dv">${fmt ? fmt(v) : esc(v)}</span></div>`)
    .join("");
  return `<div class="details">${list}${gcal}</div>`;
}

function editFormInner(b) {
  const gcal = b.htmlLink
    ? `<a class="gcal" href="${esc(b.htmlLink)}" target="_blank" rel="noopener">📅 Open in Google Calendar</a>`
    : "";
  return `<form method="POST" action="/api/owner" class="bform">
      <input type="hidden" name="action" value="edit">
      <input type="hidden" name="eventId" value="${esc(b.eventId)}">
      ${bookingFields(b)}
      <button class="btn btn-confirm" type="submit">Save changes</button>
      ${gcal}
    </form>`;
}

function addEventButton() {
  return `<button class="btn btn-add" data-toggle="addform">＋ Add event</button>`;
}

function addEventDrawer() {
  return `<div id="addform" class="drawer" hidden>
      <form method="POST" action="/api/owner" class="bform">
        <input type="hidden" name="action" value="create">
        ${bookingFields()}
        <button class="btn btn-confirm" type="submit">Create booking</button>
      </form>
    </div>`;
}

function bookingCard(b) {
  const eid = esc(b.eventId);
  let btns = "";
  if (b.status === "RESCHEDULE REQUESTED") {
    btns = `${link("/api/reschedule-approve", b.eventId, "Approve", "btn-confirm")}
            ${link("/api/reschedule-decline", b.eventId, "Keep current", "btn-cancel")}`;
  } else if (b.status === "PENDING") {
    btns = `${link("/api/confirm", b.eventId, "Confirm", "btn-confirm")}
            ${link("/api/decline", b.eventId, "Decline", "btn-cancel")}
            <button class="btn btn-resched" data-toggle="rf-${eid}">Reschedule</button>`;
  } else {
    btns = `${link("/api/decline", b.eventId, "Cancel", "btn-cancel")}
            <button class="btn btn-resched" data-toggle="rf-${eid}">Reschedule</button>`;
  }

  const requested =
    b.status === "RESCHEDULE REQUESTED" && b.proposedDate
      ? `<div class="creq">Requested new date: <b>${esc(shortDate(b.proposedDate))}</b>${b.proposedTime ? ` · ${esc(b.proposedTime)}` : ""}</div>`
      : "";
  const loc = b.location ? `<div class="cloc">${esc(b.location)}</div>` : "";

  return `<div class="card${b.status === "RESCHEDULE REQUESTED" ? " req" : ""}" id="b-${eid}" data-date="${esc(b.date)}">
    <div class="crow">
      <div class="cname">${esc(b.client || "—")}</div>
      ${badge(b.status)}
    </div>
    <div class="cwhen">${esc(shortWhen(b))}</div>
    ${loc}
    ${requested}
    <div class="cactions">
      ${btns}
      <span class="spacer"></span>
      <a class="editlink" href="#" data-toggle="df-${eid}">Details</a>
      <a class="editlink" href="#" data-toggle="ef-${eid}">Edit</a>
    </div>
    <div id="df-${eid}" class="drawer" hidden>${detailsInner(b)}</div>
    <div id="rf-${eid}" class="drawer" hidden>${rescheduleFormInner(b)}</div>
    <div id="ef-${eid}" class="drawer" hidden>${editFormInner(b)}</div>
  </div>`;
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function shiftYm(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function monthCells(bookings, ym) {
  const pad = (n) => String(n).padStart(2, "0");
  const [y, m] = ym.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevMonthDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const today = todayPacific();

  const byDay = {};
  for (const b of bookings) {
    if (b.status === "CANCELLED" || !b.date || b.date.slice(0, 7) !== ym) continue;
    (byDay[b.date] ||= []).push(b);
  }

  let cells = "";
  for (let i = firstDow - 1; i >= 0; i--) {
    cells += `<div class="cd muted"><span class="cn">${prevMonthDays - i}</span></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${ym}-${pad(d)}`;
    const items = byDay[ds] || [];
    const has = items.length > 0;
    const cls = `cd${ds === today ? " today" : ""}`;
    const attr = has ? ` data-date="${ds}"` : "";
    const num = has
      ? `<a class="cn" href="#b-${esc(items[0].eventId)}">${d}</a>`
      : `<span class="cn">${d}</span>`;
    // One dot per booking that day (capped at 4 so a busy day doesn't overflow).
    const dots = has
      ? `<span class="dots">${"<span class=\"dot\"></span>".repeat(Math.min(items.length, 4))}</span>`
      : "";
    cells += `<div class="${cls}"${attr}>${num}${dots}</div>`;
  }
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    cells += `<div class="cd muted"><span class="cn">${d}</span></div>`;
  }
  return cells;
}

function renderMonth(bookings, ym, nav) {
  const dow = ["S", "M", "T", "W", "T", "F", "S"].map((x) => `<div>${x}</div>`).join("");
  const head = nav
    ? `<div class="mnav">
        <a class="marw" href="?ym=${shiftYm(ym, -1)}" title="Previous month">‹</a>
        <span class="mtitle">${monthTitle(ym)}</span>
        <a class="marw" href="?ym=${shiftYm(ym, 1)}" title="Next month">›</a>
      </div>`
    : `<div class="mnav"><span class="mtitle left">${monthTitle(ym)}</span></div>`;
  return `<div class="month${nav ? "" : " second"}">
    ${head}
    <div class="cdow">${dow}</div>
    <div class="cgrid">${monthCells(bookings, ym)}</div>
  </div>`;
}

// Native calendar: current month (with nav) + next month (desktop only).
function calendarPanel(bookings, ym) {
  const gcal = CALENDAR_ID
    ? `<a class="callink" href="https://calendar.google.com/calendar/r/month" target="_blank" rel="noopener">Open full Google Calendar ↗</a>`
    : "";
  return `<div class="calbox">
    ${renderMonth(bookings, ym, true)}
    ${renderMonth(bookings, shiftYm(ym, 1), false)}
    ${gcal}
  </div>`;
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Two-way hover link between cards and calendar days + form drawer toggles.
const DASHBOARD_SCRIPT = `<script>
(function(){
  document.addEventListener('click',function(e){
    var cp=e.target.closest('[data-copy]');
    if(cp){ e.preventDefault();
      var src=document.getElementById(cp.getAttribute('data-copy'));
      if(src&&navigator.clipboard){ navigator.clipboard.writeText(src.value||src.textContent||'');
        var o=cp.textContent; cp.textContent='Copied!'; setTimeout(function(){cp.textContent=o;},1500); }
      return; }
    var t=e.target.closest('[data-toggle]'); if(!t) return;
    e.preventDefault();
    var el=document.getElementById(t.getAttribute('data-toggle')); if(el) el.hidden=!el.hidden;
  });
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  var cards=all('.card[data-date]'), days=all('.cd[data-date]');
  function hl(date,on){
    cards.forEach(function(c){ if(c.getAttribute('data-date')===date) c.classList.toggle('hl',on); });
    days.forEach(function(d){ if(d.getAttribute('data-date')===date) d.classList.toggle('hl',on); });
  }
  cards.concat(days).forEach(function(el){
    var date=el.getAttribute('data-date');
    el.addEventListener('mouseenter',function(){hl(date,true);});
    el.addEventListener('mouseleave',function(){hl(date,false);});
  });
})();
</script>`;

// Minimal single-color line icons (Feather-style, inherit currentColor).
function icon(name) {
  const p = {
    cal: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>`,
    clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
    gift: `<path d="M20 12v10H4V12"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`,
    users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
    userplus: `<path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>`,
    star: `<path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9l-5.8 3 1.1-6.45-4.7-4.6 6.5-.95L12 2.5z"/>`,
    chat: `<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 3.6 11.5a8.4 8.4 0 0 1 8.4-8.4h.5a8.4 8.4 0 0 1 8.5 8.4z"/>`,
    image: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>`,
    grid: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
  }[name] || "";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

// ── App shell (persistent sidebar on desktop, bottom bar on mobile) ───────────
// Past and Leads are no longer separate destinations — they're a toggle inside
// Bookings and Clients respectively (see segToggle). Chats/Reviews/Gallery sit
// behind "More": they're used far less often than the first three, and eight
// items across a phone-width tab bar left each one about 34px wide with 9.5px
// labels. Four tabs doubles that.
const NAV_ITEMS = [
  ["bookings", "Bookings", "cal"],
  ["clients", "Clients", "users"],
  ["followups", "Follow-ups", "gift"],
  ["more", "More", "grid"],
];
const navHref = (k) => `/api/owner${k === "bookings" ? "" : `?view=${k}`}`;

const BRAND_MARK = `<svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#b0542e"/><circle cx="20" cy="21" r="10.5" fill="#fff"/><circle cx="16" cy="17" r="2" fill="#e8836b"/><circle cx="24" cy="16.5" r="2" fill="#5f8c6b"/><circle cx="25.5" cy="23" r="2" fill="#e2a33a"/><circle cx="17.5" cy="25.5" r="2" fill="#7a6cbf"/><circle cx="20" cy="21" r="2.4" fill="#f6f0e4"/></svg>`;

function sideNav(active) {
  const links = NAV_ITEMS.map(
    ([k, label, ic]) => `<a class="${k === active ? "on" : ""}" href="${navHref(k)}"><span class="si">${icon(ic)}</span>${label}</a>`
  ).join("");
  return `<aside class="sidebar">
    <div class="brand">${BRAND_MARK}<span class="bt">Face Painting<b>Dashboard</b></span></div>
    <nav class="sidenav">${links}</nav>
  </aside>`;
}

function tabBar(active) {
  const links = NAV_ITEMS.map(
    ([k, label, ic]) => `<a class="${k === active ? "on" : ""}" href="${navHref(k)}"><span class="ic">${icon(ic)}</span><span class="lbl">${label}</span></a>`
  ).join("");
  return `<nav class="tabbar">${links}</nav>`;
}

// Wraps a view's content in the consistent shell so every tab shares one frame.
function appShell(active, content) {
  return `<div class="shell">${sideNav(active)}<main class="content">${content}</main>${tabBar(active)}</div>`;
}

// A segmented control that's real navigation (plain links to a scope= query
// param), not client-side state — matches every other control in this
// dashboard, which is server-rendered throughout. items: [{ href, label, active }]
function segToggle(items) {
  return `<div class="seg">${items
    .map((i) => `<a class="${i.active ? "on" : ""}" href="${i.href}">${esc(i.label)}</a>`)
    .join("")}</div>`;
}

// Small drill-back link for the pages tucked under the "More" tab, since they
// no longer have their own slot in the bar.
function backToMore() {
  return `<a href="${navHref("more")}" class="editlink" style="display:inline-block;margin-bottom:6px">‹ More</a>`;
}

// A hidden POST form reduced to a single button (used for the one-off card actions).
function actionForm(action, key, view, label, cls) {
  return `<form method="POST" action="/api/owner" style="display:inline">
      <input type="hidden" name="action" value="${esc(action)}">
      <input type="hidden" name="key" value="${esc(key)}">
      <input type="hidden" name="view" value="${esc(view)}">
      <button class="${cls}" type="submit">${label}</button>
    </form>`;
}

// A client's one-time review link + buttons to send it (SMS) or copy it.
// `base` is the site origin; returns "" when there's no base or key to build from.
function askReviewControls(base, { key, name, phone }) {
  if (!base || !key) return "";
  const link = `${base}/api/review?rk=${encodeURIComponent(key)}&token=${reviewToken(key)}&name=${encodeURIComponent(firstName(name) || "")}`;
  const first = firstName(name) || "there";
  const msg = `Hi ${first}! Thanks for choosing Face Painting California. We'd love a quick review: ${link}`;
  const cid = `rl-${String(key).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const sms = phone ? `<a class="btn btn-copy" href="${esc(smsHref(phone, msg))}">📣 Ask for review</a>` : "";
  return `${sms}
    <button class="btn btn-copy" data-copy="${cid}">Copy review link</button>
    <input id="${cid}" type="text" readonly value="${esc(link)}" style="position:absolute;left:-9999px" aria-hidden="true">`;
}

function followupCard(f) {
  const key = esc(f.key);
  const taid = `sug-${key}`;
  const last = [shortDate(f.lastEventDate), f.lastEventType, f.lastLocation]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  const first = esc(firstName(f.name));
  return `<div class="card">
    <div class="crow">
      <div class="cname">${esc(f.name || "—")}</div>
      <span class="days">🎂 in ${f.daysUntil} day${f.daysUntil === 1 ? "" : "s"}</span>
    </div>
    <div class="fmeta">Birthday around ${esc(shortDate(f.nextBirthday))}</div>
    ${last ? `<div class="fsub">Last: ${last}</div>` : ""}
    <div class="copybox"><textarea id="${taid}" rows="4" readonly>${esc(f.suggestedText)}</textarea></div>
    <div class="cactions">
      ${f.phone ? `<a class="btn btn-text" href="${esc(f.smsHref)}">💬 Text ${first}</a>` : ""}
      <button class="btn btn-copy" data-copy="${taid}">Copy text</button>
      ${f.email ? actionForm("promo", f.key, "followups", "✉️ Send email discount", "btn btn-add") : ""}
      <span class="spacer"></span>
      ${actionForm("optout-owner", f.key, "followups", "Not interested", "btn-plain")}
    </div>
  </div>`;
}

export function followupsPage(followups) {
  const list = followups.length
    ? followups.map(followupCard).join("")
    : `<div class="empty fullrow">No birthdays coming up in the next few weeks.</div>`;
  const content = `
    <div class="vhead"><div><h1>Follow-ups</h1><p class="sub">${followups.length} birthday${followups.length === 1 ? "" : "s"} coming up · ${esc(BIRTHDAY_DISCOUNT)} offer</p></div></div>
    <p class="hint">Text is the fastest way. Tap “Text” to open Messages with the note ready, or Copy it. Email is optional.</p>
    <div class="cardgrid" style="margin-top:14px">${list}</div>`;
  return shellPage("Follow-ups · Face Painting CA", appShell("followups", content), DASHBOARD_SCRIPT);
}

// Shared add/edit fields for a client or lead row.
function clientFields(c = {}) {
  const v = (x) => esc(x || "");
  return `
    <input class="bin" type="text" name="clientName" placeholder="Client name *" value="${v(c.name)}" required>
    <input class="bin" type="tel" name="clientPhone" placeholder="Phone" value="${v(c.phone)}">
    <input class="bin" type="email" name="clientEmail" placeholder="Email" value="${v(c.email)}">
    <div class="hint">Enter at least a phone or an email so we can recognize and reach them.</div>
    <input class="bin" type="text" name="organization" placeholder="School or company (optional)" value="${v(c.organization)}">
    <div class="hint">Set this so Sky recognizes the school or company again next time, even if a different person books.</div>
    <input class="bin" type="text" name="eventType" placeholder="Last event type (e.g. Birthday Party)" value="${v(c.lastEventType)}">
    <div class="form-row">
      <input type="date" name="lastEventDate" value="${v(c.lastEventDate)}">
      <input class="bin" type="text" name="birthday" placeholder="Birthday MM-DD (optional)" value="${v(c.birthday)}" style="flex:1;min-width:120px">
    </div>
    <input class="bin" type="text" name="location" placeholder="Last location / address" value="${v(c.lastLocation)}">
    <textarea class="bin" name="notes" placeholder="Notes" rows="2">${v(c.notes)}</textarea>`;
}

function clientCard(c, base, scope = "clients") {
  const key = esc(c.key);
  const meta = [c.phone, c.email].filter(Boolean).map(esc).join(" · ");
  const last = [shortDate(c.lastEventDate), c.lastEventType].filter(Boolean).map(esc).join(" · ");
  const tags = [];
  if (c.source) tags.push(`<span class="badge b-cancelled">${esc(c.source)}</span>`);
  if (c.optOut) tags.push(`<span class="badge b-cancelled">opted out</span>`);
  const bookings =
    c.totalBookings && c.totalBookings !== "0"
      ? ` · ${esc(c.totalBookings)} booking${c.totalBookings === "1" ? "" : "s"}`
      : "";
  return `<div class="card">
    <div class="crow">
      <div class="cname">${esc(c.name || "—")}${c.organization ? ` <span style="font-weight:400;color:#a4552a">· ${esc(c.organization)}</span>` : ""}</div>
      <div>${tags.join(" ")}</div>
    </div>
    ${meta ? `<div class="crmeta">${meta}</div>` : ""}
    ${last ? `<div class="crmeta">Last: ${last}${bookings}</div>` : ""}
    ${c.birthday ? `<div class="crmeta">🎂 ${esc(c.birthday)}</div>` : ""}
    ${c.notes ? `<div class="crmeta">${esc(c.notes)}</div>` : ""}
    <div class="cactions">
      ${c.phone ? `<a class="btn btn-text" href="sms:${esc(String(c.phone).replace(/[^\\d+]/g, ""))}">💬 Text</a>` : ""}
      ${c.email ? `<a class="btn btn-copy" href="mailto:${esc(c.email)}">✉️ Email</a>` : ""}
      ${askReviewControls(base, { key: c.key, name: c.name, phone: c.phone })}
      <span class="spacer"></span>
      <a class="editlink" href="#" data-toggle="ec-${key}">Edit</a>
    </div>
    <div id="ec-${key}" class="drawer" hidden>
      <form method="POST" action="/api/owner" class="bform">
        <input type="hidden" name="action" value="client-edit">
        <input type="hidden" name="key" value="${key}">
        <input type="hidden" name="view" value="clients">
        ${scope === "leads" ? `<input type="hidden" name="scope" value="leads">` : ""}
        ${clientFields(c)}
        <button class="btn btn-confirm" type="submit">Save changes</button>
      </form>
    </div>
  </div>`;
}

function addClientButton(idSuffix, label) {
  return `<button class="btn btn-add" data-toggle="add-${idSuffix}">＋ ${label}</button>`;
}
// `idSuffix` only namespaces the drawer's toggle id — the form itself always
// posts view=clients, plus scope=leads when relevant, so it redirects back to
// whichever half of the merged page you were adding to.
function addClientDrawer(action, idSuffix, scope) {
  return `<div id="add-${idSuffix}" class="drawer" hidden>
      <form method="POST" action="/api/owner" class="bform">
        <input type="hidden" name="action" value="${action}">
        <input type="hidden" name="view" value="clients">
        ${scope === "leads" ? `<input type="hidden" name="scope" value="leads">` : ""}
        ${clientFields()}
        <button class="btn btn-confirm" type="submit">Save</button>
      </form>
    </div>`;
}

// Clients and Leads are the same data (your Clients sheet, filtered by
// source === "lead") and already shared clientCard before this merge, so this
// is a toggle over one list rather than two separate pages.
export function clientsPage(allClients, base, scope = "clients") {
  const isLeads = scope === "leads";
  const leadCount = allClients.filter((c) => c.source === "lead").length;
  const clientCount = allClients.length - leadCount;
  const list = isLeads ? allClients.filter((c) => c.source === "lead") : allClients;
  const sorted = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const rows = sorted.length
    ? sorted.map((c) => clientCard(c, base, scope)).join("")
    : isLeads
    ? `<div class="empty fullrow">No leads yet. Sky saves people who chat but don't book, and you can add your own.</div>`
    : `<div class="empty fullrow">No clients yet. Add the past clients you already know to start.</div>`;

  const toggle = segToggle([
    { href: navHref("clients"), label: `Clients · ${clientCount}`, active: !isLeads },
    { href: `${navHref("clients")}&scope=leads`, label: `Leads · ${leadCount}`, active: isLeads },
  ]);

  const content = `
    <div class="vhead">
      <div>
        <h1>${isLeads ? "Leads" : "Clients"}</h1>
        <p class="sub">${isLeads ? `${leadCount} to follow up` : `${clientCount} in your CRM`}</p>
      </div>
      ${addClientButton(isLeads ? "leads" : "clients", isLeads ? "Add lead" : "Add client")}
    </div>
    ${toggle}
    ${addClientDrawer(isLeads ? "lead-create" : "client-create", isLeads ? "leads" : "clients", isLeads ? "leads" : "")}
    <div class="cardgrid">${rows}</div>`;
  return shellPage(
    `${isLeads ? "Leads" : "Clients"} · Face Painting CA`,
    appShell("clients", content),
    DASHBOARD_SCRIPT
  );
}

// ── Past events ───────────────────────────────────────────────────────────────
// Current Pacific wall-clock as "YYYY-MM-DDTHH:MM" for lexicographic comparison
// against an event's end stamp — no timezone math needed.
function nowPacificStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
function bookingEndStamp(b) {
  const parts = (b.time || "").split(/\s*[-–]\s*/);
  const end = (parts[1] || parts[0] || "23:59").trim();
  return `${b.date}T${/^\d{1,2}:\d{2}$/.test(end) ? end.padStart(5, "0") : "23:59"}`;
}
function isPastBooking(b, nowStamp) {
  return b.date && bookingEndStamp(b) < nowStamp;
}

function pastCard(b, base) {
  const eid = esc((b.eventId || `${b.client}${b.date}`).replace(/[^a-zA-Z0-9_-]/g, "") || "x");
  const phone = b.phone ? `<a class="btn btn-text" href="sms:${esc(String(b.phone).replace(/[^\d+]/g, ""))}">💬 Text</a>` : "";
  const reviewKey = normalizeKey({ phone: b.phone, email: b.email });
  return `<div class="card">
    <div class="crow">
      <div class="cname">${esc(b.client || "—")}</div>
      <span class="badge b-confirmed">Completed</span>
    </div>
    <div class="cwhen">${esc(shortWhen(b))}</div>
    ${b.location ? `<div class="cloc">${esc(b.location)}</div>` : ""}
    <div class="cactions">
      ${phone}
      ${askReviewControls(base, { key: reviewKey, name: b.client, phone: b.phone })}
      <button class="btn btn-resched" data-toggle="rb-${eid}">Rebook</button>
      <span class="spacer"></span>
      <a class="editlink" href="#" data-toggle="dp-${eid}">Details</a>
    </div>
    <div id="dp-${eid}" class="drawer" hidden>${detailsInner(b)}</div>
    <div id="rb-${eid}" class="drawer" hidden>
      <form method="POST" action="/api/owner" class="bform">
        <input type="hidden" name="action" value="create">
        <input type="hidden" name="view" value="bookings">
        ${bookingFields({ client: b.client, email: b.email, phone: b.phone, eventType: b.eventType, guests: b.guests, location: b.location, quote: b.quote })}
        <button class="btn btn-confirm" type="submit">Create booking</button>
      </form>
    </div>
  </div>`;
}

export function pastPage(past, base) {
  let list = "";
  let lastYm = "";
  for (const b of past) {
    const g = b.date.slice(0, 7);
    if (g !== lastYm) {
      list += `<div class="sec">${monthTitle(g)}</div>`;
      lastYm = g;
    }
    list += pastCard(b, base);
  }
  if (!past.length) list = `<div class="empty fullrow">No past events yet.</div>`;
  const toggle = segToggle([
    { href: navHref("bookings"), label: "Upcoming", active: false },
    { href: `${navHref("bookings")}?scope=past`, label: "Past", active: true },
  ]);
  const content = `
    <div class="vhead"><div><h1>Past events</h1><p class="sub">${past.length} completed</p></div></div>
    ${toggle}
    <p class="hint">Events automatically move here once their time has passed. Tap Rebook to set up a repeat.</p>
    <div class="cardgrid" style="margin-top:14px">${list}</div>`;
  return shellPage("Past · Face Painting CA", appShell("bookings", content), DASHBOARD_SCRIPT);
}

// ── Reviews (moderation) ──────────────────────────────────────────────────────
function starRow(n) {
  return `<span style="color:#f5b301;font-size:17px;letter-spacing:2px">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}
function reviewCard(r) {
  const pending = r.status !== "approved";
  return `<div class="card">
    <div class="crow">
      <div class="cname">${esc(r.name || "—")}</div>
      <span class="badge ${pending ? "b-pending" : "b-confirmed"}">${pending ? "Pending" : "Live"}</span>
    </div>
    <div class="cwhen">${starRow(r.rating)}${r.eventType ? ` · ${esc(r.eventType)}` : ""}</div>
    <div class="crmeta" style="margin-top:8px;color:#4a4740;font-size:15px;line-height:1.5">“${esc(r.text)}”</div>
    <div class="cactions">
      ${pending ? actionForm("review-approve", r.id, "reviews", "Approve", "btn btn-confirm") : ""}
      ${actionForm("review-reject", r.id, "reviews", pending ? "Reject" : "Hide", "btn-plain")}
      <span class="spacer"></span>
      <span class="crmeta">${esc(r.submitted || "")}</span>
    </div>
  </div>`;
}

export function reviewsPage(reviews, base) {
  const pending = reviews.filter((r) => r.status !== "approved" && r.status !== "rejected");
  const approved = reviews.filter((r) => r.status === "approved");
  const shareLink = `${base || ""}/review`;
  const linkBox = `<div class="card fullrow">
      <div class="cname" style="font-size:16px">📣 Your review link</div>
      <p class="crmeta" style="margin-top:4px">Share this with clients to collect reviews — it opens your review form.</p>
      <div class="cactions" style="margin-top:12px">
        <input id="pubreviewlink" type="text" readonly value="${esc(shareLink)}" onclick="this.select()"
          style="flex:1;min-width:180px;padding:11px 12px;border:1px solid #e7ddcc;border-radius:11px;background:#fdfbf6;font-size:14px;color:#4a4740">
        <button class="btn btn-copy" data-copy="pubreviewlink">Copy link</button>
        <a class="btn btn-text" href="sms:?&body=${encodeURIComponent(`We'd love a quick review! ${shareLink}`)}">💬 Text it</a>
      </div>
    </div>`;
  const content = `
    ${backToMore()}
    <div class="vhead"><div><h1>Reviews</h1><p class="sub">${pending.length} pending · ${approved.length} live on your site</p></div></div>
    <p class="hint">Approve the ones you want public. Approved reviews show on your website. For a link personalized to one client, use “Ask for review” on the Clients tab, or on a booking's card.</p>
    <div class="cardgrid">
      ${linkBox}
      <div class="sec">Pending</div>
      ${pending.length ? pending.map(reviewCard).join("") : `<div class="empty fullrow">No new reviews.</div>`}
      <div class="sec">Live on your site</div>
      ${approved.length ? approved.map(reviewCard).join("") : `<div class="empty fullrow">No approved reviews yet.</div>`}
    </div>`;
  return shellPage("Reviews · Face Painting CA", appShell("more", content), DASHBOARD_SCRIPT);
}

// ── More (hub for the lower-frequency pages) ────────────────────────────────
function moreLinkCard(iconName, title, sub, href) {
  return `<a class="card" href="${href}" style="display:block;text-decoration:none;color:inherit">
    <div class="crow">
      <div style="display:flex;align-items:center;gap:13px;min-width:0">
        <span style="display:flex;color:#b0542e;flex-shrink:0">${icon(iconName)}</span>
        <div style="min-width:0">
          <div class="cname" style="font-size:17px">${esc(title)}</div>
          <div class="crmeta">${esc(sub)}</div>
        </div>
      </div>
      <span style="color:#c9bfa9;font-size:20px;flex-shrink:0">›</span>
    </div>
  </a>`;
}

export function morePage() {
  const content = `
    <div class="vhead"><div><h1>More</h1><p class="sub">Chats, reviews, and your gallery</p></div></div>
    <div class="cardgrid">
      ${moreLinkCard("chat", "Chats", "Conversations that ended in a booking or a lead", navHref("chats"))}
      ${moreLinkCard("star", "Reviews", "Moderate and share client reviews", navHref("reviews"))}
      ${moreLinkCard("image", "Gallery", "Manage the photos on your website", navHref("gallery"))}
    </div>`;
  return shellPage("More · Face Painting CA", appShell("more", content), DASHBOARD_SCRIPT);
}

// ── Chats ─────────────────────────────────────────────────────────────────────
// Archived Sky conversations. Only chats that produced a booking or a lead are
// kept — see the Conversations tab in api/_lib/sheets.js for why.
function conversationCard(c) {
  const badge =
    c.outcome === "booking"
      ? `<span class="pill" style="background:#e6f2e8;color:#2f6b41">Booked</span>`
      : `<span class="pill" style="background:#fdf0e6;color:#a4552a">Lead</span>`;

  const contact = [c.phone, c.email].filter(Boolean).join(" · ");
  const lines = (c.transcript || "").split("\n").filter(Boolean);

  return `<div class="card">
      <div class="cname">${esc(c.name || "Someone")} ${badge}</div>
      <p class="crmeta" style="margin-top:4px">${esc(c.logged)}${contact ? ` · ${esc(contact)}` : ""}</p>
      ${c.summary ? `<p class="crmeta" style="margin-top:6px;color:#4a4740">${esc(c.summary)}</p>` : ""}
      <div class="cactions" style="margin-top:10px">
        <button class="btn btn-resched" data-toggle="chat-${esc(c.id)}">Read the chat</button>
      </div>
      <div id="chat-${esc(c.id)}" class="drawer" hidden>
        <div style="background:#fdfbf6;border:1px solid #e7ddcc;border-radius:11px;padding:12px;margin-top:10px;max-height:420px;overflow:auto">
          ${
            lines.length
              ? lines
                  .map((line) => {
                    const isClient = line.startsWith("Client:");
                    const text = line.replace(/^(Client|Sky):\s*/, "");
                    return `<div style="margin-bottom:8px">
                        <div style="font-size:11px;font-weight:700;color:${isClient ? "#a4552a" : "#7a8b9a"};text-transform:uppercase;letter-spacing:.4px">${isClient ? "Client" : "Sky"}</div>
                        <div style="font-size:14px;color:#3a3833;white-space:pre-wrap">${esc(text)}</div>
                      </div>`;
                  })
                  .join("")
              : `<div class="empty">No transcript saved.</div>`
          }
        </div>
      </div>
    </div>`;
}

export function chatsPage(conversations) {
  const booked = conversations.filter((c) => c.outcome === "booking").length;
  const leads = conversations.length - booked;
  const content = `
    ${backToMore()}
    <div class="vhead"><div><h1>Chats</h1><p class="sub">${booked} ended in a booking · ${leads} left as leads</p></div></div>
    <p class="hint">Conversations with Sky that produced a booking or a lead. Useful for checking what a client actually asked for, and for spotting questions worth adding to your FAQ. Chats that went nowhere aren't kept, and these are worth clearing out once the season's over.</p>
    <div class="cardgrid">
      ${
        conversations.length
          ? conversations.map(conversationCard).join("")
          : `<div class="empty fullrow">No conversations yet. They'll show up here once someone books or leaves their details with Sky.</div>`
      }
    </div>`;
  return shellPage("Chats · Face Painting CA", appShell("more", content), DASHBOARD_SCRIPT);
}

// Client-side resize (keeps uploads small + fast) then POST the image bytes.
const GALLERY_SCRIPT = `<script>
(function(){
  var inp=document.getElementById('galup'); if(!inp) return;
  var status=document.getElementById('galstatus');
  function resize(file){
    return new Promise(function(res,rej){
      var img=new Image(), url=URL.createObjectURL(file);
      img.onload=function(){
        var max=1600,w=img.width,h=img.height;
        if(w>max||h>max){ if(w>h){h=Math.round(h*max/w);w=max;} else {w=Math.round(w*max/h);h=max;} }
        var c=document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        URL.revokeObjectURL(url);
        c.toBlob(function(b){ b?res(b):rej(new Error('encode failed')); },'image/jpeg',0.85);
      };
      img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('not an image')); };
      img.src=url;
    });
  }
  inp.addEventListener('change', async function(){
    var files=Array.prototype.slice.call(inp.files||[]); if(!files.length) return;
    for(var i=0;i<files.length;i++){
      status.textContent='Uploading '+(i+1)+' of '+files.length+'…';
      try{
        var blob=await resize(files[i]);
        var name=((files[i].name||'photo').replace(/\\.[^.]+$/,''))+'.jpg';
        var r=await fetch('/api/owner?action=gallery-upload&filename='+encodeURIComponent(name),{method:'POST',headers:{'content-type':'image/jpeg'},body:blob});
        if(!r.ok){ status.textContent='Upload failed: '+(await r.text()).slice(0,140); return; }
      }catch(e){ status.textContent='Upload failed: '+e.message; return; }
    }
    status.textContent='Done! Refreshing…';
    location.reload();
  });
})();
</script>`;

function galleryImageCard(g) {
  return `<div class="galcard">
    <img src="${esc(g.url)}" alt="${esc(g.alt)}" loading="lazy">
    ${actionForm("gallery-remove", g.id, "gallery", "Remove", "btn btn-cancel")}
  </div>`;
}

export function galleryPage(gallery) {
  const grid = gallery.length
    ? gallery.map(galleryImageCard).join("")
    : `<div class="empty fullrow">No photos yet — add your first with “Add photos”.</div>`;
  const content = `
    ${backToMore()}
    <div class="vhead">
      <div><h1>Gallery</h1><p class="sub">${gallery.length} photo${gallery.length === 1 ? "" : "s"} on your website</p></div>
      <label class="btn btn-add" for="galup">＋ Add photos</label>
    </div>
    <input type="file" id="galup" accept="image/*" multiple hidden>
    <div id="galstatus" class="hint"></div>
    <p class="hint">Photos show in your public site's gallery. Uploads are resized automatically; tap Remove to take one down. (If uploads say storage isn't set up, enable Blob in Vercel → Storage.)</p>
    <div class="galgrid">${grid}</div>`;
  return shellPage("Gallery · Face Painting CA", appShell("more", content), DASHBOARD_SCRIPT + GALLERY_SCRIPT);
}

/**
 * Controls whether Sky may offer a second artist. Sits on the Bookings page
 * because it changes what she sells today, so it needs to be somewhere seen
 * daily rather than buried in a settings screen.
 */
function secondArtistToggle(available) {
  return `<div class="card fullrow" style="border-left:4px solid ${available ? "#4e9d63" : "#c9752f"}">
      <div class="cname" style="font-size:16px">🎨 Second artist ${available ? "available" : "unavailable"}</div>
      <p class="crmeta" style="margin-top:4px">
        ${
          available
            ? "Sky can recommend a second artist (+$200) for big groups, and quote it on the spot."
            : "Sky won't offer or quote a second artist. If a client asks for one, she'll say the team will check availability and flag it on the booking for you."
        }
      </p>
      <div class="cactions" style="margin-top:12px">
        ${actionForm(
          "second-artist",
          available ? "no" : "yes",
          "bookings",
          available ? "Turn off — I'm working solo" : "Turn on — I have a partner",
          available ? "btn btn-cancel" : "btn btn-confirm"
        )}
      </div>
      <p class="crmeta" style="margin-top:8px;font-size:12px">Takes up to a minute to reach Sky.</p>
    </div>`;
}

export function dashboardPage(bookings, ym, secondArtistAvailable = false) {
  const today = todayPacific();
  const month = /^\d{4}-\d{2}$/.test(ym || "") ? ym : today.slice(0, 7);
  const requests = bookings.filter((b) => b.status === "RESCHEDULE REQUESTED");
  const upcoming = bookings
    .filter((b) => b.status !== "RESCHEDULE REQUESTED" && b.status !== "CANCELLED" && b.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // Group the upcoming list by month with a header before each group.
  let list = "";
  let lastYm = "";
  for (const b of upcoming) {
    const g = b.date.slice(0, 7);
    if (g !== lastYm) {
      list += `<div class="sec">${monthTitle(g)}</div>`;
      lastYm = g;
    }
    list += bookingCard(b);
  }
  if (!upcoming.length) list = `<div class="empty">No upcoming bookings.</div>`;

  const requestsHtml = requests.length
    ? `<div class="sec">Reschedule Requests</div>${requests.map(bookingCard).join("")}`
    : "";

  const toggle = segToggle([
    { href: navHref("bookings"), label: "Upcoming", active: true },
    { href: `${navHref("bookings")}?scope=past`, label: "Past", active: false },
  ]);

  const content = `
    <div class="vhead">
      <div>
        <h1>Bookings</h1>
        <p class="sub">${upcoming.length} upcoming · ${requests.length} reschedule request${requests.length === 1 ? "" : "s"}</p>
      </div>
      ${addEventButton()}
    </div>
    ${toggle}
    ${addEventDrawer()}
    ${secondArtistToggle(secondArtistAvailable)}
    <div class="bkgrid">
      <div class="bklist">${requestsHtml}${list}</div>
      <div class="bkcal">${calendarPanel(bookings, month)}</div>
    </div>`;
  return shellPage("Bookings · Face Painting CA", appShell("bookings", content), DASHBOARD_SCRIPT);
}

// Performs a create/edit action from the dashboard, then mirrors the result to
// the sheet. Writes go straight to Google Calendar (the source of truth).
async function handleAction(body, base) {
  // ── Client / lead create + edit (Clients tab) ──────────────────────────────
  if (body.action === "client-create" || body.action === "client-edit" || body.action === "lead-create") {
    const rec = {
      name: (body.clientName || "").trim(),
      phone: (body.clientPhone || "").trim(),
      email: (body.clientEmail || "").trim(),
      organization: (body.organization || "").trim(),
      lastEventType: (body.eventType || "").trim(),
      lastEventDate: (body.lastEventDate || "").trim(),
      lastLocation: (body.location || "").trim(),
      birthday: (body.birthday || "").trim(),
      notes: (body.notes || "").trim(),
    };
    // Only a CREATE sets the source. A plain edit leaves it out entirely, so
    // mergeClient() falls back to whatever the record already had. The edit
    // form is shared between Clients and Leads and always posts the same
    // action="client-edit", so setting "manual" here unconditionally used to
    // silently promote a lead out of the Leads list on every edit — fixing a
    // typo in their phone number would make them vanish from follow-up.
    if (body.action !== "client-edit") {
      rec.source = body.action === "lead-create" ? "lead" : "manual";
    }
    if (body.key) rec.key = String(body.key).trim(); // preserve identity on edit
    // Need a name and at least one contact method to key/reach them.
    if (!rec.name || !(rec.phone || rec.email)) return;
    await upsertClient(rec);
    invalidate("clients");
    return;
  }

  // ── Send the birthday discount email + stamp Last Promo Sent ────────────────
  if (body.action === "promo") {
    const key = (body.key || "").trim();
    if (!key) return;
    const clients = await getClients();
    const c = clients.find((x) => x.key === key);
    if (!c || !c.email) return;
    const token = optoutToken(key);
    const unsubscribeUrl = `${base}/api/status?action=optout&key=${encodeURIComponent(key)}&token=${token}`;
    const htmlBody = birthdayPromoHtml(c, { discount: BIRTHDAY_DISCOUNT, unsubscribeUrl });
    await sendEmail({ to: c.email, subject: "A birthday treat from Face Painting California 🎂", html: htmlBody });
    await setClientFlag(key, { lastPromoSent: todayPacific() });
    invalidate("clients");
    return;
  }

  // ── Owner marks a follow-up client as not interested ───────────────────────
  if (body.action === "optout-owner") {
    const key = (body.key || "").trim();
    if (key) {
      await setClientFlag(key, { optOut: true });
      invalidate("clients");
    }
    return;
  }

  // ── Second artist availability (controls what Sky may offer) ───────────────
  if (body.action === "second-artist") {
    await setSetting(SECOND_ARTIST_KEY, body.key === "yes" ? "yes" : "no");
    return;
  }

  // ── Review moderation (approve / reject) ───────────────────────────────────
  if (body.action === "review-approve" || body.action === "review-reject") {
    const id = (body.key || "").trim();
    if (id) {
      await setReviewStatus(id, body.action === "review-approve" ? "approved" : "rejected");
      invalidate("reviews");
    }
    return;
  }

  // ── Gallery: remove a photo ────────────────────────────────────────────────
  if (body.action === "gallery-remove") {
    const id = (body.key || "").trim();
    if (id) {
      await removeGalleryImage(id);
      invalidate("gallery");
    }
    return;
  }

  // ── Booking create / edit (Calendar) ───────────────────────────────────────
  const d = {
    clientName: (body.clientName || "").trim(),
    clientEmail: (body.clientEmail || "").trim(),
    clientPhone: (body.clientPhone || "").trim(),
    eventType: (body.eventType || "").trim(),
    guestCount: (body.guestCount || "").trim(),
    date: (body.date || "").trim(),
    startTime: (body.startTime || "").trim(),
    endTime: (body.endTime || "").trim(),
    location: (body.location || "").trim(),
    quote: (body.quote || "").trim(),
    notes: (body.notes || "").trim(),
  };

  if (body.action === "create") {
    if (!d.clientName || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !d.startTime) return;
    const booking = await createOwnerBooking(d);
    await syncBookingsToSheet([booking], { markCancellations: false }).catch((e) =>
      console.error("Sheet sync (create) failed:", e)
    );
    invalidate("calendarBookings");
    invalidate("bookingsFromSheet");
  } else if (body.action === "edit") {
    const eventId = (body.eventId || "").trim();
    if (!eventId || !d.clientName) return;
    const booking = await updateBooking(eventId, d);
    await syncBookingsToSheet([booking], { markCancellations: false }).catch((e) =>
      console.error("Sheet sync (edit) failed:", e)
    );
    invalidate("calendarBookings");
    invalidate("bookingsFromSheet");
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const html = (code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(body);
  };

  const url0 = new URL(req.url, "http://localhost");

  // Public gallery feed for the marketing site (no auth — images are public).
  if (req.method === "GET" && url0.searchParams.get("public") === "gallery") {
    try {
      const imgs = await getGallery();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.end(JSON.stringify(imgs.map((g) => ({ url: g.url, alt: g.alt }))));
    } catch (e) {
      console.error("Gallery feed error:", e);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end("[]");
    }
  }

  // Gallery photo upload: raw (resized) image body, owner cookie required.
  if (req.method === "POST" && url0.searchParams.get("action") === "gallery-upload") {
    if (!isAuthed(req)) {
      res.statusCode = 403;
      return res.end("Not authorized");
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      res.statusCode = 503;
      return res.end("Photo storage isn't set up yet. Enable Blob in Vercel (Storage → Blob), then try again.");
    }
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) {
        res.statusCode = 400;
        return res.end("Empty upload.");
      }
      const filename = (url0.searchParams.get("filename") || "photo.jpg").replace(/[^\w.\-]/g, "_");
      const { put } = await import("@vercel/blob");
      const blob = await put(`gallery/${Date.now()}-${filename}`, buffer, {
        access: "public",
        contentType: req.headers["content-type"] || "image/jpeg",
      });
      await addGalleryImage({ url: blob.url, alt: "" });
      invalidate("gallery");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ url: blob.url }));
    } catch (e) {
      console.error("Gallery upload error:", e);
      res.statusCode = 500;
      return res.end("Upload failed. Please try again.");
    }
  }

  if (!OWNER_PASSWORD) {
    return html(503, shellPage("Setup needed", `<div class="login"><h1>Setup needed</h1><p class="sub">Set the <code>OWNER_DASHBOARD_PASSWORD</code> environment variable to enable this page.</p></div>`));
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      body = {};
    }

    // An authed action (booking, client/lead, promo, opt-out forms).
    if (body.action) {
      if (!isAuthed(req)) return html(200, loginPage("Please sign in again."));
      const proto = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").includes("localhost") ? "http" : "https");
      const base = `${proto}://${req.headers.host}`;
      try {
        await handleAction(body, base);
      } catch (error) {
        console.error("Owner action error:", error);
      }
      // Redirect so a refresh doesn't resubmit the form; return to the same
      // view AND scope, so e.g. editing a lead lands back on the Leads toggle
      // rather than bouncing to the Clients half of the merged page.
      const viewOk = /^(followups|clients|reviews|gallery|more)$/.test(body.view || "") ? body.view : "";
      const scopeOk = /^(past|leads)$/.test(body.scope || "") ? body.scope : "";
      const qs = [viewOk && `view=${viewOk}`, scopeOk && `scope=${scopeOk}`].filter(Boolean).join("&");
      res.statusCode = 303;
      res.setHeader("Location", `/api/owner${qs ? `?${qs}` : ""}`);
      return res.end();
    }

    // Otherwise it's a login attempt.
    if (!passwordMatches(body.password)) {
      return html(401, loginPage("Incorrect password. Try again."));
    }
    res.setHeader("Set-Cookie", `owner_session=${sessionToken()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
    // fall through to render the dashboard
  } else if (!isAuthed(req)) {
    return html(200, loginPage(""));
  }

  try {
    const params = new URL(req.url, "http://localhost").searchParams;
    const view = params.get("view") || "bookings";
    const scope = params.get("scope") || "";
    const proto = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").includes("localhost") ? "http" : "https");
    const base = process.env.APP_BASE_URL || `${proto}://${req.headers.host}`;

    if (view === "gallery") {
      return html(200, galleryPage(await getGallery()));
    }
    if (view === "reviews") {
      return html(200, reviewsPage(await getReviews(), base));
    }
    if (view === "chats") {
      return html(200, chatsPage(await getConversations()));
    }
    if (view === "more") {
      return html(200, morePage());
    }
    if (view === "clients") {
      // Leads is a toggle within Clients now, not a separate destination — same
      // sheet, same card, just a filter. See clientsPage().
      return html(200, clientsPage(await getClients(), base, scope === "leads" ? "leads" : "clients"));
    }
    if (view === "followups") {
      // Exclude clients who already have a future booking on the calendar.
      const [clients, bookings] = await Promise.all([getClients(), listCalendarBookings()]);
      const today = todayPacific();
      const excludeKeys = new Set(
        bookings
          .filter((b) => b.status !== "CANCELLED" && b.date >= today)
          .map((b) => normalizeKey({ phone: b.phone, email: b.email }))
          .filter(Boolean)
      );
      const followups = await listBirthdayFollowups({ clients, excludeKeys });
      return html(200, followupsPage(followups));
    }

    // Bookings, either scope. Past is a toggle here now too — same reasoning as
    // Clients/Leads, just with a different card layout underneath (see
    // pastPage/pastCard vs dashboardPage/bookingCard).
    if (scope === "past") {
      const rows = await getBookingsFromSheet();
      const now = nowPacificStamp();
      const past = rows
        .filter((b) => b.status !== "CANCELLED" && isPastBooking(b, now))
        .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
      return html(200, pastPage(past, base));
    }

    const bookings = await listCalendarBookings();
    return html(200, dashboardPage(bookings, params.get("ym"), await isSecondArtistAvailable()));
  } catch (error) {
    console.error("Owner dashboard error:", error);
    return html(500, shellPage("Error", `<div class="login"><h1>Something went wrong</h1><p class="sub">Couldn't load the dashboard. Check the server logs.</p></div>`));
  }
}
