import crypto from "crypto";
import { listCalendarBookings, createOwnerBooking, updateBooking } from "./_lib/book.js";
import { syncBookingsToSheet } from "./_lib/sheets.js";
import { fmtTimeRange } from "./_lib/email.js";

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
  .bform .bin,.form-row input{padding:11px 12px;border:1px solid #e7ddcc;border-radius:11px;font-size:15px;width:100%;background:#fdfbf6;font-family:inherit}
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
  .calbox{background:#fff;border:1px solid #efe6d6;border-radius:16px;padding:16px 14px}
  @media(min-width:900px){ .calbox{background:transparent;border:none;border-radius:0;padding:0} }
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

  /* Login */
  .login{max-width:360px;margin:70px auto;text-align:center;background:#f6f0e4;border-radius:20px;padding:34px 28px}
  .login input{width:100%;padding:12px;border:1px solid #e7ddcc;border-radius:12px;font-size:16px;margin:10px 0;background:#fff}
  .login .btn-add{width:100%}
  .err{color:#b0402a;font-size:14px;margin-top:8px}
`;

function shellPage(title, body, script = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body>${body}${script}</body></html>`;
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

  const body = `<div class="app">
    <div class="a-head">
      <div class="a-head-row">
        <div>
          <h1>Bookings</h1>
          <p class="sub">${upcoming.length} upcoming · ${requests.length} reschedule request${requests.length === 1 ? "" : "s"}</p>
        </div>
        ${addEventButton()}
      </div>
    </div>
    <div class="a-add">${addEventDrawer()}</div>
    <div class="a-cal">${calendarPanel(bookings, month)}</div>
    <div class="a-list">${requestsHtml}${list}</div>
  </div>`;
  return shellPage("Bookings · Face Painting CA", body, DASHBOARD_SCRIPT);
}

// Performs a create/edit action from the dashboard, then mirrors the result to
// the sheet. Writes go straight to Google Calendar (the source of truth).
async function handleAction(body) {
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

    // An authed create/edit action (from the Add event / Edit forms).
    if (body.action) {
      if (!isAuthed(req)) return html(200, loginPage("Please sign in again."));
      try {
        await handleAction(body);
      } catch (error) {
        console.error("Owner action error:", error);
      }
      // Redirect so a refresh doesn't resubmit the form.
      res.statusCode = 303;
      res.setHeader("Location", "/api/owner");
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
    const ym = new URL(req.url, "http://localhost").searchParams.get("ym");
    const bookings = await listCalendarBookings();
    return html(200, dashboardPage(bookings, ym));
  } catch (error) {
    console.error("Owner dashboard error:", error);
    return html(500, shellPage("Error", `<div class="login"><h1>Something went wrong</h1><p class="sub">Couldn't load bookings. Check the server logs.</p></div>`));
  }
}
