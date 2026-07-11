import crypto from "crypto";
import { listCalendarBookings } from "./book.js";
import { fmtDate, fmtTimeRange } from "./email.js";

const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const OWNER_PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || "";

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
const STYLE = `
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#faf6ef;color:#2d3540}
  .wrap{max-width:640px;margin:0 auto;padding:20px 16px 60px}
  h1{font-size:22px;margin:6px 0 2px}
  .sub{color:#9aa1a9;font-size:14px;margin:0 0 20px}
  .sec{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#9aa1a9;margin:26px 0 10px}
  .card{background:#fff;border:1px solid #efe7db;border-radius:16px;padding:16px 16px 14px;margin-bottom:12px}
  .card.req{border-color:#f0c98a;background:#fffaf1}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
  .date{font-size:17px;font-weight:800}
  .who{color:#55606b;font-size:14px;margin-top:2px}
  .meta{color:#9aa1a9;font-size:13px;margin-top:6px;line-height:1.5}
  .badge{font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap}
  .b-confirmed{background:#e6f4ea;color:#1e7a3c}
  .b-pending{background:#fdeee0;color:#b5651d}
  .b-cancelled{background:#eee;color:#888}
  .b-reschedule{background:#fff3d6;color:#9a6a00}
  .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  a.btn,button.btn{display:inline-block;border:none;border-radius:22px;padding:10px 18px;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer}
  .btn-green{background:#4e9d63;color:#fff}
  .btn-coral{background:#e8836b;color:#fff}
  .btn-ghost{background:#f1f1f1;color:#b91c1c}
  details.resched{margin-top:12px}
  details.resched summary{font-size:14px;color:#55606b;cursor:pointer}
  .form-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .form-row input{flex:1;min-width:130px;padding:10px;border:1px solid #efe7db;border-radius:10px;font-size:15px}
  .empty{color:#9aa1a9;text-align:center;padding:30px 0}
  .login{max-width:340px;margin:80px auto;text-align:center}
  .login input{width:100%;padding:12px;border:1px solid #efe7db;border-radius:12px;font-size:16px;margin:10px 0}
  .login .btn-coral{width:100%}
  .err{color:#b91c1c;font-size:14px;margin-top:8px}
  @media (prefers-color-scheme:dark){
    body{background:#1c2029;color:#e6e8ec}
    .card{background:#252b36;border-color:#333b47}
    .card.req{background:#2c2a1f;border-color:#5c4a1e}
    .form-row input,.login input{background:#1c2029;border-color:#333b47;color:#e6e8ec}
    .btn-ghost{background:#333b47;color:#ff9b8f}
  }
`;

function shellPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function loginPage(error) {
  return shellPage(
    "Owner · Face Painting CA",
    `<div class="login">
      <h1>🎨 Bookings</h1>
      <p class="sub">Enter the owner password to continue.</p>
      <form method="POST" action="/api/owner">
        <input type="password" name="password" placeholder="Password" autofocus required>
        <button class="btn btn-coral" type="submit">Sign in</button>
        ${error ? `<div class="err">${error}</div>` : ""}
      </form>
    </div>`
  );
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

function bookingCard(b) {
  const meta = [
    b.location ? esc(b.location) : "",
    b.phone ? esc(b.phone) : "",
    b.quote ? esc(b.quote) : "",
  ].filter(Boolean).join(" · ");

  let actions = "";
  if (b.status === "RESCHEDULE REQUESTED") {
    const proposed = b.proposedDate ? `Requested: <b>${esc(fmtDate(b.proposedDate))}</b>${b.proposedTime ? ` · ${esc(b.proposedTime)}` : ""}` : "";
    actions = `<div class="meta">${proposed}</div>
      <div class="actions">
        ${link("/api/reschedule-approve", b.eventId, "Approve New Date", "btn-green")}
        ${link("/api/reschedule-decline", b.eventId, "Keep Current", "btn-ghost")}
      </div>`;
  } else if (b.status === "PENDING") {
    actions = `<div class="actions">
        ${link("/api/confirm", b.eventId, "Confirm", "btn-green")}
        ${link("/api/decline", b.eventId, "Decline", "btn-ghost")}
        ${rescheduleForm(b)}
      </div>`;
  } else if (b.status === "CONFIRMED") {
    actions = `<div class="actions">
        ${link("/api/decline", b.eventId, "Cancel", "btn-ghost")}
        ${rescheduleForm(b)}
      </div>`;
  }

  return `<div class="card${b.status === "RESCHEDULE REQUESTED" ? " req" : ""}">
    <div class="row">
      <div>
        <div class="date">${esc(fmtDate(b.date))}</div>
        <div class="who">${esc(b.time ? fmtTimeRange(b.time) + " · " : "")}${esc(b.client || "—")}${b.eventType ? " · " + esc(b.eventType) : ""}</div>
      </div>
      ${badge(b.status)}
    </div>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    ${actions}
  </div>`;
}

// Inline manual-reschedule disclosure (owner picks a new date; posts with cookie).
function rescheduleForm(b) {
  return `<details class="resched">
    <summary class="btn btn-coral">Reschedule</summary>
    <form method="POST" action="/api/reschedule-manual">
      <input type="hidden" name="eventId" value="${esc(b.eventId)}">
      <div class="form-row">
        <input type="date" name="date" required>
        <input type="time" name="time" placeholder="Start time">
      </div>
      <div class="form-row"><button class="btn btn-green" type="submit">Move booking</button></div>
    </form>
  </details>`;
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function dashboardPage(bookings) {
  const today = todayPacific();
  const requests = bookings.filter((b) => b.status === "RESCHEDULE REQUESTED");
  const upcoming = bookings
    .filter((b) => b.status !== "RESCHEDULE REQUESTED" && b.status !== "CANCELLED" && b.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const body = `<div class="wrap">
    <h1>🎨 Bookings</h1>
    <p class="sub">${upcoming.length} upcoming · ${requests.length} reschedule request${requests.length === 1 ? "" : "s"}</p>
    ${requests.length ? `<div class="sec">Reschedule Requests</div>${requests.map(bookingCard).join("")}` : ""}
    <div class="sec">Upcoming Events</div>
    ${upcoming.length ? upcoming.map(bookingCard).join("") : `<div class="empty">No upcoming bookings.</div>`}
  </div>`;
  return shellPage("Bookings · Face Painting CA", body);
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

  // Login attempt.
  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      body = {};
    }
    if (!passwordMatches(body.password)) {
      return html(401, loginPage("Incorrect password. Try again."));
    }
    res.setHeader("Set-Cookie", `owner_session=${sessionToken()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
    // fall through to render the dashboard
  } else if (!isAuthed(req)) {
    return html(200, loginPage(""));
  }

  try {
    const bookings = await listCalendarBookings();
    return html(200, dashboardPage(bookings));
  } catch (error) {
    console.error("Owner dashboard error:", error);
    return html(500, shellPage("Error", `<div class="login"><h1>Something went wrong</h1><p class="sub">Couldn't load bookings. Check the server logs.</p></div>`));
  }
}
