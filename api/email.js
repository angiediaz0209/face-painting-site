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

// ── Brand ───────────────────────────────────────────────────────────────────
const FROM_NAME = "Face Painting California";
const BUSINESS_PHONE = "(415) 991-9374";
const SMS_NUMBER = "4159919374";
const BUSINESS_EMAIL = "steff.diaz0209@gmail.com"; // display only
const CORAL = "#e8836b";
const CORAL_RED = "#ef6c4d";
const NAVY = "#2b3442";
const GREEN = "#4e9d63";
const INK = "#2d3540";
const BODY = "#55606b";
const MUTED = "#9aa1a9";
const CREAM = "#fbf6ec";
const PAGE = "#faf6ef";
const LINE = "#efe7db";

// ── Formatters ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// "2026-08-15" -> "Saturday, August 15, 2026"
export function fmtDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (isNaN(d)) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(d);
}

function to12h(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm || "").trim());
  if (!m) return hhmm;
  let h = +m[1];
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
}

// "14:00 - 16:00" -> "2:00 PM – 4:00 PM"
export function fmtTimeRange(time) {
  if (!time) return "";
  const parts = time.split(/\s*[-–]\s*/);
  if (parts.length === 2) return `${to12h(parts[0])} – ${to12h(parts[1])}`;
  return to12h(time);
}

// A Google Calendar "add event" link the client can tap.
export function addToCalendarUrl(b) {
  const dateCompact = (b.date || "").replace(/-/g, "");
  const [start, end] = (b.time || "").split(/\s*[-–]\s*/);
  const s = (start || "").replace(":", "") + "00";
  const e = (end || "").replace(":", "") + "00";
  const dates = `${dateCompact}T${s}/${dateCompact}T${e}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Face Painting - ${b.client || "Your Event"}`,
    dates,
    ctz: "America/Los_Angeles",
    location: b.location || "",
    details: "Your face painting booking with Face Painting California.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── Shared shell ────────────────────────────────────────────────────────────
function logoHeader() {
  return `
  <tr><td style="padding:26px 24px;text-align:center;border-bottom:1px solid ${LINE};">
    <span style="display:inline-block;width:34px;height:34px;line-height:34px;background:#fdeee9;border-radius:50%;text-align:center;font-size:18px;vertical-align:middle;">🎨</span>
    <span style="font-size:20px;font-weight:800;color:${INK};vertical-align:middle;margin-left:8px;letter-spacing:-.2px;">Face&nbsp;Painting <span style="color:${CORAL_RED};">CA</span></span>
  </td></tr>`;
}

function footer() {
  return `
  <tr><td style="padding:22px 24px 30px;text-align:center;border-top:1px solid ${LINE};">
    <div style="font-size:13px;color:${MUTED};">Face Painting CA &nbsp;·&nbsp; ${BUSINESS_PHONE} &nbsp;·&nbsp; ${BUSINESS_EMAIL}</div>
    <div style="font-size:13px;color:${MUTED};margin-top:4px;">Serving the San Francisco Bay Area</div>
  </td></tr>`;
}

function shell({ preheader = "", inner }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        ${logoHeader()}
        ${inner}
        ${footer()}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function heroBanner({ bg, icon, title, subtitle, titleColor = "#ffffff" }) {
  return `
  <tr><td style="background:${bg};padding:34px 30px;text-align:center;">
    <div style="width:52px;height:52px;line-height:52px;margin:0 auto 14px;background:rgba(255,255,255,.22);border-radius:50%;text-align:center;font-size:24px;color:#fff;">${icon}</div>
    <div style="font-size:26px;font-weight:800;color:${titleColor};letter-spacing:-.3px;">${esc(title)}</div>
    ${subtitle ? `<div style="font-size:15px;color:rgba(255,255,255,.9);margin-top:8px;">${subtitle}</div>` : ""}
  </td></tr>`;
}

function detailRow(label, value, { valueColor = INK, last = false } = {}) {
  return `<tr>
    <td style="padding:14px 20px;font-size:14px;color:${BODY};${last ? "" : `border-bottom:1px solid ${LINE};`}">${esc(label)}</td>
    <td align="right" style="padding:14px 20px;font-size:14px;font-weight:700;color:${valueColor};${last ? "" : `border-bottom:1px solid ${LINE};`}">${value}</td>
  </tr>`;
}

function ctaButton(href, label, { bg = CORAL, color = "#fff" } = {}) {
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${color};padding:14px 30px;border-radius:26px;text-decoration:none;font-weight:700;font-size:15px;">${label}</a>`;
}

// ── 1. Owner: pending booking needs confirmation (image 7) ───────────────────
export function pendingNotificationHtml(b, { approveUrl, declineUrl, calendarUrl }) {
  const rows = [
    detailRow("Client", esc(b.clientName)),
    b.clientEmail ? detailRow("Email", `<a href="mailto:${esc(b.clientEmail)}" style="color:#2f6fd6;text-decoration:none;">${esc(b.clientEmail)}</a>`) : "",
    b.clientPhone ? detailRow("Phone", esc(b.clientPhone)) : "",
    b.eventType ? detailRow("Event", esc(b.eventType)) : "",
    b.guestCount ? detailRow("Guests", esc(b.guestCount)) : "",
    detailRow("Date", esc(fmtDate(b.date))),
    detailRow("Time", esc(fmtTimeRange(`${b.startTime} - ${b.endTime}`))),
    b.location ? detailRow("Location", esc(b.location)) : "",
    detailRow("Quote", esc(b.quote), { valueColor: CORAL }),
    b.notes ? detailRow("Notes", esc(b.notes), { last: true }) : "",
  ].filter(Boolean);
  // mark the real last row's borders off
  const inner = `
  <tr><td style="padding:28px 24px 8px;">
    <div style="font-size:20px;font-weight:800;color:${INK};">⚠️ Pending — Needs Confirmation</div>
  </td></tr>
  <tr><td style="padding:12px 24px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">
      ${rows.join("")}
    </table>
  </td></tr>
  <tr><td style="padding:22px 24px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;">${ctaButton(approveUrl, "Approve &amp; Send Invite", { bg: GREEN })}</td>
      <td>${ctaButton(declineUrl, "Decline", { bg: "#f1f1f1", color: CORAL_RED })}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px 4px;font-size:13px;color:${BODY};line-height:1.5;">
    <b>Approve</b> confirms the booking, turns the event green, and emails ${esc(b.clientEmail)} their confirmation. <b>Decline</b> removes the pending booking and sends the client a polite note.
  </td></tr>
  ${calendarUrl ? `<tr><td style="padding:10px 24px 4px;"><a href="${calendarUrl}" style="color:#2f6fd6;font-weight:700;text-decoration:none;">Open in Google Calendar</a></td></tr>` : ""}
  <tr><td style="padding:16px 24px 26px;font-size:12px;color:${MUTED};">Sky, your Face Painting California assistant</td></tr>`;
  return shell({ preheader: `New booking request from ${b.clientName}`, inner });
}

// ── 2. Client: you're all booked (image 5) ───────────────────────────────────
function hoursFromTime(time) {
  const p = (time || "").split(/\s*[-–]\s*/);
  if (p.length < 2) return 0;
  const val = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h + (m || 0) / 60;
  };
  return Math.round(val(p[1]) - val(p[0]));
}

export function clientConfirmationHtml(b) {
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six"];
  const h = hoursFromTime(b.time);
  const pkg =
    b.hoursLabel ||
    (h ? `${words[h] || h}-hour party` : b.quote ? `${b.quote} package` : "Face painting");
  const rows = [
    detailRow("Event Date", esc(fmtDate(b.date))),
    detailRow("Time", esc(fmtTimeRange(b.time))),
    b.location ? detailRow("Location", esc(b.location)) : "",
    detailRow("Package", esc(pkg)),
    b.artist ? detailRow("Artist", esc(b.artist)) : "",
    detailRow("Balance Due", `${esc(b.quote)} · due day of event`, { valueColor: CORAL, last: true }),
  ].filter(Boolean);
  const inner = `
  ${heroBanner({ bg: CORAL, icon: "✓", title: "You're All Booked!", subtitle: "We can't wait to paint some masterpieces 🎉" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Thank you for booking with Face Painting CA! Your party is officially on the calendar and one of our artists is already looking forward to it. Here are your details:</p>
  </td></tr>
  <tr><td style="padding:20px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:24px 30px 6px;text-align:center;">${ctaButton(addToCalendarUrl(b), "Add to Calendar")}</td></tr>
  <tr><td style="padding:16px 30px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:14px;font-weight:800;color:${INK};">Need to move your date, or can't make it anymore?</div>
        <p style="font-size:14px;color:${BODY};line-height:1.5;margin:8px 0 14px;">No problem at all — just text us directly and we'll sort out a new date or cancel your booking, no forms required.</p>
        <a href="sms:${SMS_NUMBER}" style="display:inline-block;background:#fff;border:1px solid #dfe4e6;color:${INK};padding:11px 20px;border-radius:24px;text-decoration:none;font-weight:700;font-size:14px;">💬 Text Us to Reschedule / Cancel</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: "Your face painting party is confirmed!", inner });
}

// ── 3. Client: booking declined (image 6) ────────────────────────────────────
export function clientDeclineHtml(b) {
  const inner = `
  ${heroBanner({ bg: NAVY, icon: "✕", title: "Your Booking Request Was Declined", subtitle: "A note from the Face Painting CA team" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Thank you so much for thinking of us for your celebration! After checking our calendar, we have to <b>decline your request for ${esc(fmtDate(b.date))}</b> — our artists are already booked that day, so unfortunately we won't be able to make it work.</p>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">We know this isn't the news you were hoping for, and we're genuinely sorry for the inconvenience. We'd love the chance to be part of your next celebration — whether that's a new date for this event or a future party down the road.</p>
  </td></tr>
  <tr><td style="padding:20px 30px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3ec;border-radius:14px;">
      <tr><td style="padding:22px 20px;text-align:center;">
        <div style="font-size:15px;font-weight:800;color:${INK};margin-bottom:14px;">Want to find a new date together?</div>
        ${ctaButton(`sms:${SMS_NUMBER}`, "💬 Text Us to Find a New Date")}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:18px 30px 8px;text-align:center;font-size:13px;color:${MUTED};">Thank you again for considering Face Painting CA — we hope to paint for your family soon!</td></tr>`;
  return shell({ preheader: "About your booking request", inner });
}

// ── Send ────────────────────────────────────────────────────────────────────
function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

export async function sendEmail({ to, subject, html, fromEmail }) {
  const from = fromEmail || process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!from || !to) {
    console.warn("sendEmail skipped — missing from/to.");
    return;
  }
  const auth = getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });
  const lines = [
    `From: "${FROM_NAME}" <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ];
  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}
