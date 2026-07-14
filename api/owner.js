import crypto from "crypto";
import { listCalendarBookings, createOwnerBooking, updateBooking } from "./_lib/book.js";
import { syncBookingsToSheet, getBookingsFromSheet, getReviews, setReviewStatus } from "./_lib/sheets.js";
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

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const OWNER_PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || "";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "";

// Per-event token for the one-click action links (same scheme as the emails).
function eventToken(eventId) {
  return crypto.createHmac("sha256", CONFIRM_SECRET).update(eventId).digest("hex").slice(0, 32);
}

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
const SERIF = "Georgia,'Iowan Old Style','Times New Roman',serif";
const STYLE = `
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#e9e2d4;color:#2b2a28;-webkit-font-smoothing:antialiased}
  a{color:inherit}

  /* App shell */
  .app{max-width:660px;margin:0 auto;padding:14px 12px 48px}
  @media(min-width:900px){
    .app{max-width:1180px;margin:26px auto;padding:0;background:#f6f0e4;border-radius:24px;overflow:hidden;box-shadow:0 14px 46px rgba(70,45,20,.10);
      display:grid;grid-template-columns:minmax(0,1fr) 430px;grid-template-rows:auto auto 1fr;
      grid-template-areas:"head cal" "add cal" "list cal"}
    .a-head{grid-area:head;padding:34px 32px 0 38px}
    .a-add{grid-area:add;padding:18px 32px 2px 38px}
    .a-list{grid-area:list;padding:14px 32px 42px 38px}
    .a-cal{grid-area:cal;background:#fff;border-left:1px solid #ece2d1;padding:30px 30px 34px}
  }
  .a-head{padding:6px 6px 0}
  .a-add{padding:12px 6px 2px}
  .a-cal{padding:8px 2px}
  .a-list{padding:8px 6px 0}

  h1{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:30px;font-weight:800;letter-spacing:-.5px;margin:2px 0 4px}
  .sub{color:#a29a8b;font-size:14px;margin:0}
  .sec{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#b0a692;margin:26px 0 12px}

  /* Buttons */
  .btn{display:inline-block;border:none;border-radius:22px;padding:9px 18px;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;font-family:inherit}
  .btn-add{background:#b0542e;color:#fff;padding:11px 20px;border-radius:24px;font-size:15px}
  .btn-cancel{background:#efe6d6;color:#a94e2a}
  .btn-resched{background:#f1d8c6;color:#a94e2a}
  .btn-confirm{background:#5f8c6b;color:#fff}

  /* Header: title on the left, Add event button pinned top-right */
  .a-head-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
  .a-head-row .btn-add{flex-shrink:0;white-space:nowrap;margin-top:4px}

  /* Cards */
  .card{position:relative;background:#fff;border:1px solid #efe6d6;border-radius:16px;padding:20px 20px 16px;margin-bottom:14px;
    transition:box-shadow .16s ease,border-color .16s ease}
  .card:hover,.card.hl{border-color:#e6c4a6;box-shadow:0 8px 24px rgba(120,70,40,.13)}
  .card.req{border-color:#eccf9a;background:#fdf8ee}
  .crow{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .cname{font-family:${SERIF};font-size:21px;font-weight:700;color:#2b2a28;line-height:1.2}
  .cwhen{color:#7c8676;font-size:14.5px;margin-top:7px}
  .cloc{color:#b3ab9c;font-size:14px;margin-top:4px}
  .creq{color:#9a6a00;font-size:13.5px;margin-top:8px}
  .badge{font-size:12px;font-weight:700;padding:5px 13px;border-radius:16px;white-space:nowrap;flex-shrink:0}
  .b-confirmed{background:#e3ede1;color:#4c7a58}
  .b-pending{background:#f6e6d2;color:#a9752f}
  .b-cancelled{background:#eceae6;color:#8a8378}
  .b-reschedule{background:#f7ead0;color:#9a6a00}
  .cactions{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:16px}
  .cactions .spacer{flex:1}
  .editlink{color:#a29a8b;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}
  .editlink:hover{color:#8a8378}

  /* Drawers (reschedule / edit / add forms) */
  .drawer{margin-top:14px}
  .drawer[hidden]{display:none}
  .bform{display:flex;flex-direction:column;gap:9px}
  .bform .bin,.form-row input{padding:11px 12px;border:1px solid #e7ddcc;border-radius:11px;font-size:16px;width:100%;background:#fdfbf6;font-family:inherit}
  .bform textarea.bin{resize:vertical}
  .form-row{display:flex;gap:8px;flex-wrap:wrap}
  .form-row input{flex:1;min-width:120px}
  .gcal{display:inline-block;margin-top:6px;font-size:14px;font-weight:700;color:#b0542e;text-decoration:none}
  .empty{color:#a29a8b;text-align:center;padding:30px 0}

  /* Details drawer (read-only extra info) */
  .details{border-top:1px solid #f0e8d9;padding-top:13px}
  .drow{display:flex;gap:12px;font-size:14.5px;margin-bottom:8px}
  .dk{flex:0 0 62px;color:#b0a692;font-weight:700}
  .dv{color:#4a4740;white-space:pre-wrap;word-break:break-word;min-width:0}
  .dv a{color:#b0542e;text-decoration:none}
  .dv a:hover{text-decoration:underline}
  .dempty{color:#a29a8b;font-size:14px}

  /* Calendar */
  .calbox{background:#fff;border:1px solid #efe6d6;border-radius:16px;padding:18px 16px}
  .month{max-width:400px;margin:0 auto}
  .month.second{display:none}
  @media(min-width:900px){ .month.second{display:block;margin-top:26px;padding-top:22px;border-top:1px solid #f0e8d9} }
  .mnav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .mtitle{font-family:${SERIF};font-size:19px;font-weight:700;color:#2b2a28;flex:1;text-align:center}
  .mtitle.left{text-align:left}
  .marw{width:30px;height:30px;line-height:28px;text-align:center;color:#b3ab9c;text-decoration:none;font-size:20px;border-radius:8px}
  .marw:hover{color:#b0542e;background:#f3ece0}
  .cdow{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;font-weight:700;letter-spacing:.5px;color:#b7ae9c;margin-bottom:6px}
  .cgrid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:8px}
  .cd{display:flex;flex-direction:column;align-items:center;min-height:44px}
  .cn{font-family:${SERIF};font-size:15px;color:#2b2a28;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:30px;border-radius:15px}
  .cd.muted .cn{color:#cfc6b3}
  .cd.today .cn{background:#b0542e;color:#fff}
  .cd.hl .cn{background:#f1d8c6;color:#a94e2a}
  .cd.today.hl .cn{background:#b0542e;color:#fff}
  .dots{display:flex;justify-content:center;gap:3px;margin-top:3px}
  .dot{width:5px;height:5px;border-radius:50%;background:#b0542e}
  .cd.today .dot{background:#b0542e}
  .callink{display:inline-block;margin-top:16px;font-size:13px;color:#b0542e;text-decoration:none}

  /* ── App shell: sidebar (desktop) + content ─────────────────────────────── */
  .shell{min-height:100vh}
  .content{max-width:760px;margin:0 auto;padding:14px 12px calc(84px + env(safe-area-inset-bottom))}
  .sidebar{display:none}
  @media(min-width:900px){
    .shell{display:grid;grid-template-columns:236px minmax(0,1fr)}
    .sidebar{display:flex;flex-direction:column;position:sticky;top:0;align-self:start;height:100vh;
      background:#f6f0e4;border-right:1px solid #ece2d1;padding:24px 16px}
    .content{max-width:1120px;margin:0;padding:30px 40px 60px}
  }
  .brand{display:flex;align-items:center;gap:10px;padding:4px 8px 4px 6px;margin-bottom:18px}
  .brand .bt{display:flex;flex-direction:column;font-family:${SERIF};line-height:1.05;color:#2b2a28;font-size:16px;font-weight:700}
  .brand .bt b{font-weight:400;font-size:12px;color:#a29a8b;letter-spacing:.5px;text-transform:uppercase}
  .sidenav{display:flex;flex-direction:column;gap:3px}
  .sidenav a{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;text-decoration:none;color:#7c7566;font-weight:700;font-size:15px}
  .sidenav a .si{display:flex;line-height:0}
  .sidenav a .si svg{width:20px;height:20px}
  .sidenav a:hover{background:#efe6d6;color:#2b2a28}
  .sidenav a.on{background:#b0542e;color:#fff}

  /* View header (title + optional action) */
  .vhead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}

  /* Bookings two-pane + responsive card grids for the CRM views */
  .bkgrid{display:grid;grid-template-columns:1fr;gap:22px}
  @media(min-width:1040px){ .bkgrid{grid-template-columns:minmax(0,1fr) 400px} .bkcal{position:sticky;top:24px;align-self:start} }
  .cardgrid{display:grid;grid-template-columns:1fr;gap:14px;align-items:start}
  @media(min-width:760px){ .cardgrid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr))} }
  .cardgrid > .sec,.cardgrid > .fullrow{grid-column:1/-1}

  /* Mobile app-style bottom tab bar */
  .tabbar{display:none}
  @media(max-width:899px){
    .tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;background:#fff;
      border-top:1px solid #ece2d1;box-shadow:0 -6px 22px rgba(70,45,20,.07);
      padding:7px 2px calc(7px + env(safe-area-inset-bottom))}
    .tabbar a{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;
      text-decoration:none;color:#a29a8b;font-size:9.5px;font-weight:700;padding:3px 1px}
    .tabbar a .ic{line-height:0}
    .tabbar a .ic svg{width:23px;height:23px;display:block}
    .tabbar a span.lbl{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tabbar a.on{color:#b0542e}
    .content{padding-top:calc(6px + env(safe-area-inset-top))}
  }

  /* CRM page extras */
  .headrow{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:6px}
  .fmeta{color:#7c8676;font-size:14.5px;margin-top:7px}
  .fsub{color:#b3ab9c;font-size:14px;margin-top:4px}
  .crmeta{color:#8a8378;font-size:13.5px;margin-top:4px}
  .copybox{margin-top:12px}
  .copybox textarea{width:100%;border:1px solid #e7ddcc;border-radius:11px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fdfbf6;resize:vertical;color:#4a4740;line-height:1.5}
  .days{font-size:12px;font-weight:700;padding:5px 12px;border-radius:16px;background:#f6e6d2;color:#a9752f;white-space:nowrap;flex-shrink:0}
  .btn-text{background:#5f8c6b;color:#fff}
  .btn-copy{background:#efe6d6;color:#7c5a2a}
  .btn-plain{background:none;border:none;cursor:pointer;color:#a29a8b;font-size:13px;font-weight:600;font-family:inherit;padding:6px 4px}
  .btn-plain:hover{color:#8a8378}
  .hint{color:#b3ab9c;font-size:13px;margin:2px 2px 8px}

  /* Login */
  .login{max-width:360px;margin:70px auto;text-align:center;background:#f6f0e4;border-radius:20px;padding:34px 28px}
  .login input{width:100%;padding:12px;border:1px solid #e7ddcc;border-radius:12px;font-size:16px;margin:10px 0;background:#fff}
  .login .btn-add{width:100%}
  .err{color:#b0402a;font-size:14px;margin-top:8px}
`;

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
    <title>${title}</title><style>${STYLE}</style>`;
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
  }[name] || "";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

// ── App shell (persistent sidebar on desktop, bottom bar on mobile) ───────────
const NAV_ITEMS = [
  ["bookings", "Bookings", "cal"],
  ["past", "Past", "clock"],
  ["followups", "Follow-ups", "gift"],
  ["clients", "Clients", "users"],
  ["leads", "Leads", "userplus"],
  ["reviews", "Reviews", "star"],
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
    <input class="bin" type="text" name="eventType" placeholder="Last event type (e.g. Birthday Party)" value="${v(c.lastEventType)}">
    <div class="form-row">
      <input type="date" name="lastEventDate" value="${v(c.lastEventDate)}">
      <input class="bin" type="text" name="birthday" placeholder="Birthday MM-DD (optional)" value="${v(c.birthday)}" style="flex:1;min-width:120px">
    </div>
    <input class="bin" type="text" name="location" placeholder="Last location / address" value="${v(c.lastLocation)}">
    <textarea class="bin" name="notes" placeholder="Notes" rows="2">${v(c.notes)}</textarea>`;
}

function clientCard(c, base) {
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
      <div class="cname">${esc(c.name || "—")}</div>
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
        ${clientFields(c)}
        <button class="btn btn-confirm" type="submit">Save changes</button>
      </form>
    </div>
  </div>`;
}

function addClientButton(view, label) {
  return `<button class="btn btn-add" data-toggle="add-${view}">＋ ${label}</button>`;
}
function addClientDrawer(action, view) {
  return `<div id="add-${view}" class="drawer" hidden>
      <form method="POST" action="/api/owner" class="bform">
        <input type="hidden" name="action" value="${action}">
        <input type="hidden" name="view" value="${view}">
        ${clientFields()}
        <button class="btn btn-confirm" type="submit">Save</button>
      </form>
    </div>`;
}

export function clientsPage(clients, base) {
  const sorted = [...clients].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const rows = sorted.length
    ? sorted.map((c) => clientCard(c, base)).join("")
    : `<div class="empty fullrow">No clients yet. Add the past clients you already know to start.</div>`;
  const content = `
    <div class="vhead">
      <div><h1>Clients</h1><p class="sub">${sorted.length} in your CRM</p></div>
      ${addClientButton("clients", "Add client")}
    </div>
    ${addClientDrawer("client-create", "clients")}
    <div class="cardgrid">${rows}</div>`;
  return shellPage("Clients · Face Painting CA", appShell("clients", content), DASHBOARD_SCRIPT);
}

export function leadsPage(leads) {
  const sorted = [...leads].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const rows = sorted.length
    ? sorted.map(clientCard).join("")
    : `<div class="empty fullrow">No leads yet. Sky saves people who chat but don't book, and you can add your own.</div>`;
  const content = `
    <div class="vhead">
      <div><h1>Leads</h1><p class="sub">${sorted.length} to follow up</p></div>
      ${addClientButton("leads", "Add lead")}
    </div>
    ${addClientDrawer("lead-create", "leads")}
    <div class="cardgrid">${rows}</div>`;
  return shellPage("Leads · Face Painting CA", appShell("leads", content), DASHBOARD_SCRIPT);
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
  const content = `
    <div class="vhead"><div><h1>Past events</h1><p class="sub">${past.length} completed</p></div></div>
    <p class="hint">Events automatically move here once their time has passed. Tap Rebook to set up a repeat.</p>
    <div class="cardgrid" style="margin-top:14px">${list}</div>`;
  return shellPage("Past · Face Painting CA", appShell("past", content), DASHBOARD_SCRIPT);
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
    <div class="vhead"><div><h1>Reviews</h1><p class="sub">${pending.length} pending · ${approved.length} live on your site</p></div></div>
    <p class="hint">Approve the ones you want public. Approved reviews show on your website. For a link personalized to one client, use “Ask for review” on the Clients or Past tab.</p>
    <div class="cardgrid">
      ${linkBox}
      <div class="sec">Pending</div>
      ${pending.length ? pending.map(reviewCard).join("") : `<div class="empty fullrow">No new reviews.</div>`}
      <div class="sec">Live on your site</div>
      ${approved.length ? approved.map(reviewCard).join("") : `<div class="empty fullrow">No approved reviews yet.</div>`}
    </div>`;
  return shellPage("Reviews · Face Painting CA", appShell("reviews", content), DASHBOARD_SCRIPT);
}

export function dashboardPage(bookings, ym) {
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

  const content = `
    <div class="vhead">
      <div>
        <h1>Bookings</h1>
        <p class="sub">${upcoming.length} upcoming · ${requests.length} reschedule request${requests.length === 1 ? "" : "s"}</p>
      </div>
      ${addEventButton()}
    </div>
    ${addEventDrawer()}
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
      lastEventType: (body.eventType || "").trim(),
      lastEventDate: (body.lastEventDate || "").trim(),
      lastLocation: (body.location || "").trim(),
      birthday: (body.birthday || "").trim(),
      notes: (body.notes || "").trim(),
      source: body.action === "lead-create" ? "lead" : "manual",
    };
    if (body.key) rec.key = String(body.key).trim(); // preserve identity on edit
    // Need a name and at least one contact method to key/reach them.
    if (!rec.name || !(rec.phone || rec.email)) return;
    await upsertClient(rec);
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
    return;
  }

  // ── Owner marks a follow-up client as not interested ───────────────────────
  if (body.action === "optout-owner") {
    const key = (body.key || "").trim();
    if (key) await setClientFlag(key, { optOut: true });
    return;
  }

  // ── Review moderation (approve / reject) ───────────────────────────────────
  if (body.action === "review-approve" || body.action === "review-reject") {
    const id = (body.key || "").trim();
    if (id) await setReviewStatus(id, body.action === "review-approve" ? "approved" : "rejected");
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
  } else if (body.action === "edit") {
    const eventId = (body.eventId || "").trim();
    if (!eventId || !d.clientName) return;
    const booking = await updateBooking(eventId, d);
    await syncBookingsToSheet([booking], { markCancellations: false }).catch((e) =>
      console.error("Sheet sync (edit) failed:", e)
    );
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const html = (code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(body);
  };

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
      // Redirect so a refresh doesn't resubmit the form; return to the same view.
      const view = /^(followups|clients|leads|past|reviews)$/.test(body.view || "") ? `?view=${body.view}` : "";
      res.statusCode = 303;
      res.setHeader("Location", `/api/owner${view}`);
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
    const proto = req.headers["x-forwarded-proto"] || (String(req.headers.host || "").includes("localhost") ? "http" : "https");
    const base = process.env.APP_BASE_URL || `${proto}://${req.headers.host}`;

    if (view === "reviews") {
      return html(200, reviewsPage(await getReviews(), base));
    }
    if (view === "past") {
      const rows = await getBookingsFromSheet();
      const now = nowPacificStamp();
      const past = rows
        .filter((b) => b.status !== "CANCELLED" && isPastBooking(b, now))
        .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
      return html(200, pastPage(past, base));
    }
    if (view === "clients") {
      return html(200, clientsPage(await getClients(), base));
    }
    if (view === "leads") {
      const clients = await getClients();
      return html(200, leadsPage(clients.filter((c) => c.source === "lead")));
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

    const bookings = await listCalendarBookings();
    return html(200, dashboardPage(bookings, params.get("ym")));
  } catch (error) {
    console.error("Owner dashboard error:", error);
    return html(500, shellPage("Error", `<div class="login"><h1>Something went wrong</h1><p class="sub">Couldn't load the dashboard. Check the server logs.</p></div>`));
  }
}
