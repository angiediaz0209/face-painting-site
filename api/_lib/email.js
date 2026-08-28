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
// Links and form actions inside emailed HTML must be absolute: some webmail
// clients render the message inside their own origin, so a relative URL like
// action="/api/status" can silently resolve against mail.google.com instead
// of this site, and the form just 404s there instead of reaching the server.
const BASE_URL = process.env.APP_BASE_URL || "https://face-painting-site.vercel.app";
const BUSINESS_PHONE = "(415) 991-9374";
// The legal entity behind the brand. It is the contracting party on the
// agreement and the issuer on the receipt; "Face Painting California" stays on
// letterheads and everywhere client-facing. Once the DBA is filed with Marin
// County, the intro wording can become "Condor Enterprise Group LLC, doing
// business as Face Painting California".
const LEGAL_NAME = "Condor Enterprise Group LLC";
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
// "4155551234", "415-555-1234", "+1 (415) 555 1234" -> "(415) 555-1234", the
// same style as the business number on the letterhead. Anything that isn't a
// 10-digit US number is left exactly as typed.
export function fmtPhone(p) {
  const raw = String(p || "").trim();
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

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

// "Please sign your agreement" callout used by the client emails. Only rendered
// when the caller passes a contractUrl (i.e. the booking isn't signed yet).
function agreementCallout(contractUrl, { pending = false } = {}) {
  if (!contractUrl) return "";
  return `
  <tr><td style="padding:18px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3ec;border-left:4px solid ${CORAL_RED};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:14px;font-weight:800;color:${INK};">📝 One quick thing: your booking agreement</div>
        <p style="font-size:14px;color:${BODY};line-height:1.6;margin:8px 0 14px;">It's already filled in with your details, it's short and in plain English. Just read it, type your name and tap sign. Takes about a minute.${pending ? " You can do it now or once we've confirmed your date." : ""}</p>
        ${ctaButton(contractUrl, "Review &amp; sign")}
      </td></tr>
    </table>
  </td></tr>`;
}

// ── 1. Owner: pending booking needs confirmation (image 7) ───────────────────
export function pendingNotificationHtml(b, { approveUrl, declineUrl, calendarUrl }) {
  // Context the artist preps with. Each gets its own row rather than being
  // crammed into Notes, so it's scannable on event morning.
  const d = b.details || {};
  const rows = [
    detailRow("Client", esc(b.clientName)),
    b.clientEmail ? detailRow("Email", `<a href="mailto:${esc(b.clientEmail)}" style="color:#2f6fd6;text-decoration:none;">${esc(b.clientEmail)}</a>`) : "",
    b.clientPhone ? detailRow("Phone", esc(b.clientPhone)) : "",
    b.eventType ? detailRow("Event", esc(b.eventType)) : "",
    d.companyName ? detailRow("Company", esc(d.companyName)) : "",
    d.occasion ? detailRow("Occasion", esc(d.occasion)) : "",
    d.honoree ? detailRow("Birthday star", esc(d.honoree)) : "",
    b.guestCount ? detailRow("Guests", esc(b.guestCount)) : "",
    d.guestMix ? detailRow("Guest mix", esc(d.guestMix)) : "",
    detailRow("Date", esc(fmtDate(b.date))),
    detailRow("Time", esc(fmtTimeRange(`${b.startTime} - ${b.endTime}`))),
    b.location ? detailRow("Location", esc(b.location)) : "",
    detailRow("Quote", esc(b.quote), { valueColor: CORAL }),
    d.specialRequests ? detailRow("Special requests", esc(d.specialRequests)) : "",
    d.secondArtistRequested
      ? detailRow("Wanted a 2nd artist", esc(d.secondArtistRequested), { valueColor: CORAL_RED })
      : "",
    d.paperworkRequest
      ? detailRow("Paperwork needed", esc(d.paperworkRequest), { valueColor: CORAL_RED })
      : "",
    b.notes ? detailRow("Notes", esc(b.notes), { last: true }) : "",
  ].filter(Boolean);

  // A custom design request is a decision only the owner can make, so it gets
  // its own callout above the buttons instead of a row that's easy to skim past.
  const customCallout = d.customRequest
    ? `<tr><td style="padding:14px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3ec;border-left:4px solid ${CORAL_RED};border-radius:10px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:14px;font-weight:800;color:${INK};">🎨 They asked about custom designs</div>
            <p style="font-size:14px;color:${BODY};line-height:1.5;margin:8px 0 0;">${esc(d.customRequest)}</p>
            <p style="font-size:13px;color:${MUTED};margin:10px 0 0;">Sky promised nothing. Go over this with them when you confirm the date.</p>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const inner = `
  <tr><td style="padding:28px 24px 8px;">
    <div style="font-size:20px;font-weight:800;color:${INK};">⚠️ Pending — Needs Confirmation</div>
  </td></tr>
  <tr><td style="padding:12px 24px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">
      ${rows.join("")}
    </table>
  </td></tr>
  ${customCallout}
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
  ${agreementCallout(b.contractUrl)}
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
  ${b.statusUrl ? `<tr><td style="padding:6px 30px 8px;text-align:center;"><a href="${b.statusUrl}" style="font-size:13px;color:${MUTED};text-decoration:underline;">View your booking status anytime</a></td></tr>` : ""}
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: "Your face painting party is confirmed!", inner });
}

// ── 2b. Client: request received, awaiting team approval ─────────────────────
/**
 * Sent the moment someone submits the website booking form, so they aren't left
 * in silence until the team approves. Deliberately says "request", not
 * "confirmed" — nothing is booked until the team approves it.
 *
 * `quote` is the object returned by computeQuote(), so the breakdown here always
 * matches what the client saw on the site.
 */
export function clientRequestReceivedHtml(b) {
  const q = b.quote || {};
  const money = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;
  const hourLabel = `${b.hours} ${b.hours === 1 ? "hour" : "hours"} of face painting`;

  const rows = [
    detailRow("Date", esc(fmtDate(b.date))),
    detailRow("Time", esc(fmtTimeRange(b.time))),
    b.location ? detailRow("Location", esc(b.location)) : "",
    b.eventType ? detailRow("Event", esc(b.eventType)) : "",
    b.guests ? detailRow("Guests", esc(b.guests), { last: true }) : "",
  ].filter(Boolean);

  const priceRows = [
    detailRow(hourLabel, money(q.hoursPrice)),
    b.secondArtist ? detailRow("Second artist", money(q.secondArtistFee)) : "",
    detailRow(
      `Travel to ${esc(q.area || "your area")}`,
      q.travelFee ? money(q.travelFee) : "Free"
    ),
    detailRow("Estimated total", money(q.total), { valueColor: CORAL, last: true }),
  ].filter(Boolean);

  const inner = `
  ${heroBanner(
    b.pending
      ? { bg: CORAL, icon: "📋", title: "We Got Your Request!", subtitle: "Our team is checking the date now" }
      : { bg: "#4e9d63", icon: "🎉", title: "You're Booked!", subtitle: "We can't wait to paint for you" }
  )}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">${
      b.pending
        ? "Thanks for sending this over! Your request is with our team now. We'll check artist availability for your date and get back to you shortly to confirm. <b>Nothing is booked just yet</b>, we'll let you know the moment it is."
        : "Thanks for booking with us! You're all set, your artist will be there. If anything changes on our end we'll reach out right away."
    }</p>
  </td></tr>
  <tr><td style="padding:20px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:16px 30px 4px;">
    <div style="font-size:13px;font-weight:800;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;padding-left:4px;margin-bottom:8px;">Your quote</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${priceRows.join("")}</table>
    <div style="font-size:13px;color:${MUTED};padding:10px 4px 0;">No payment is needed now. The balance is due on the day of your event.</div>
  </td></tr>
  ${agreementCallout(b.contractUrl, { pending: !!b.pending })}
  <tr><td style="padding:20px 30px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:14px;font-weight:800;color:${INK};">What happens next</div>
        <p style="font-size:14px;color:${BODY};line-height:1.6;margin:8px 0 14px;">We'll confirm your date by text at ${BUSINESS_PHONE}, usually within a few hours. Once it's confirmed you'll get a calendar invite from us. Need to change something, or in a hurry? Just text us.</p>
        <a href="sms:${SMS_NUMBER}" style="display:inline-block;background:#fff;border:1px solid #dfe4e6;color:${INK};padding:11px 20px;border-radius:24px;text-decoration:none;font-weight:700;font-size:14px;">💬 Text Us</a>
      </td></tr>
    </table>
  </td></tr>
  ${b.statusUrl ? `<tr><td style="padding:14px 30px 8px;text-align:center;"><a href="${b.statusUrl}" style="font-size:13px;color:${MUTED};text-decoration:underline;">Check your request status anytime</a></td></tr>` : ""}
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: "We got your request and we're checking your date.", inner });
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

// ── 3b. Client: birthday follow-up / returning-family discount ───────────────
export function birthdayPromoHtml(b, { discount = "10% off", unsubscribeUrl = "" } = {}) {
  const first = esc((b.name || b.client || "there").split(" ")[0]);
  const occasion = /birth/i.test(b.lastEventType || "") ? "birthday party" : "celebration";
  const inner = `
  ${heroBanner({ bg: CORAL, icon: "🎂", title: "A Birthday Treat For You", subtitle: "Because we loved painting for your family" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${first},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">We had the best time at your ${occasion} last time, and it sounds like another birthday might be right around the corner! We'd love to come back and paint again.</p>
  </td></tr>
  <tr><td style="padding:18px 30px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;">
      <tr><td style="padding:22px 20px;text-align:center;">
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Returning family offer</div>
        <div style="font-size:30px;font-weight:800;color:${CORAL_RED};margin:8px 0;">${esc(discount)}</div>
        <div style="font-size:14px;color:${BODY};">on your next booking</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:22px 30px 6px;text-align:center;">${ctaButton(`sms:${SMS_NUMBER}`, "💬 Text Us to Book")}</td></tr>
  <tr><td style="padding:8px 30px 8px;text-align:center;font-size:13px;color:${MUTED};">Or reach us anytime at ${BUSINESS_PHONE}</td></tr>
  ${unsubscribeUrl ? `<tr><td style="padding:6px 30px 10px;text-align:center;"><a href="${unsubscribeUrl}" style="font-size:12px;color:${MUTED};text-decoration:underline;">No thanks, don't send me offers</a></td></tr>` : ""}
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: "A little birthday treat from Face Painting California", inner });
}

// ── 4. Client: live booking status page (served in the browser) ──────────────
const STATUS_STYLES = {
  CONFIRMED: { bg: GREEN, icon: "✓", title: "Booking Confirmed", note: "You're all set — we can't wait to paint! 🎨" },
  PENDING: { bg: CORAL, icon: "⏳", title: "Booking Pending", note: "We're confirming artist availability and will be in touch shortly." },
  CANCELLED: { bg: NAVY, icon: "✕", title: "Booking Cancelled", note: "This booking is no longer on our calendar." },
  "RESCHEDULE REQUESTED": { bg: CORAL, icon: "🔄", title: "Reschedule Requested", note: "We got your request and will text you to confirm a new date." },
};

// `b` is a normalized booking (see parseEventToBooking). Pass `eventId` + `token`
// (the same HMAC that gated the page) to enable the discreet self-serve
// reschedule request form.
export function clientStatusHtml(b, { eventId, token } = {}) {
  const status = (b.status || "PENDING").toUpperCase();
  const s = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
  const active = status !== "CANCELLED";
  const requested = status === "RESCHEDULE REQUESTED";
  const canRequest = (status === "CONFIRMED" || status === "PENDING") && eventId && token;

  const rows = [
    detailRow("Event Date", esc(fmtDate(b.date))),
    b.time ? detailRow("Time", esc(fmtTimeRange(b.time))) : "",
    b.location ? detailRow("Location", esc(b.location)) : "",
    b.eventType ? detailRow("Event", esc(b.eventType)) : "",
    requested && b.proposedDate
      ? detailRow("Requested new date", esc(fmtDate(b.proposedDate)) + (b.proposedTime ? ` · ${esc(to12h(b.proposedTime))}` : ""), { valueColor: CORAL })
      : "",
    b.quote ? detailRow("Quote", esc(b.quote), { valueColor: CORAL, last: true }) : "",
  ].filter(Boolean);

  // Clients often book before they've settled on a park or venue, so the
  // address is optional at booking time. This is where they send it later.
  // Prominent when we still don't have one, tucked away when we do.
  const needsAddress = active && eventId && token && !b.location;
  const addressBlock =
    active && eventId && token
      ? `
  <tr><td style="padding:${needsAddress ? "22px" : "18px"} 30px;border-top:1px solid ${LINE};">
    <details ${needsAddress ? "open" : ""} style="text-align:center;">
      <summary style="font-size:${needsAddress ? "14px" : "13px"};color:${needsAddress ? INK : MUTED};font-weight:${needsAddress ? "700" : "400"};text-decoration:${needsAddress ? "none" : "underline"};cursor:pointer;">
        ${needsAddress ? "📍 Where's your event happening?" : "Need to update the address?"}
      </summary>
      <div style="max-width:360px;margin:14px auto 0;text-align:left;">
        ${
          needsAddress
            ? `<p style="font-size:13px;color:${BODY};line-height:1.6;text-align:center;margin:0 0 14px;">We don't have an address yet. Send it whenever you have it, even the name of the park is enough to get us started.</p>`
            : ""
        }
        <form method="POST" action="${BASE_URL}/api/status?action=address">
          <input type="hidden" name="eventId" value="${esc(eventId)}">
          <input type="hidden" name="token" value="${esc(token)}">
          <input type="text" name="location" required placeholder="Address, park or venue name"
            style="width:100%;padding:11px;border:1px solid ${LINE};border-radius:10px;font-size:15px;box-sizing:border-box;margin-bottom:12px;">
          <button type="submit" style="width:100%;background:${CORAL};color:#fff;border:none;padding:13px;border-radius:24px;font-weight:700;font-size:15px;cursor:pointer;">Send the address</button>
        </form>
      </div>
    </details>
  </td></tr>`
      : "";

  // Discreet by design: a small muted disclosure, not a button. Only offered on a
  // live booking that hasn't already got a request in flight.
  const rescheduleBlock = canRequest
    ? `
  <tr><td style="padding:24px 30px 30px;border-top:1px solid ${LINE};">
    <details style="text-align:center;">
      <summary style="font-size:13px;color:${MUTED};text-decoration:underline;cursor:pointer;">Need to change your date?</summary>
      <div style="max-width:360px;margin:14px auto 0;text-align:left;">
        <p style="font-size:12px;color:${MUTED};line-height:1.6;text-align:center;margin:0 0 14px;">We hold your artist and turn away other bookings for your date, so please reschedule only if you need to.</p>
        <form method="POST" action="${BASE_URL}/api/reschedule-request">
          <input type="hidden" name="eventId" value="${esc(eventId)}">
          <input type="hidden" name="token" value="${esc(token)}">
          <label style="display:block;font-size:13px;color:${BODY};margin-bottom:10px;">New date<br>
            <input type="date" name="date" required style="width:100%;padding:10px;border:1px solid ${LINE};border-radius:10px;font-size:15px;box-sizing:border-box;margin-top:4px;"></label>
          <label style="display:block;font-size:13px;color:${BODY};margin-bottom:14px;">Preferred start time <span style="color:${MUTED};">(optional)</span><br>
            <input type="time" name="time" style="width:100%;padding:10px;border:1px solid ${LINE};border-radius:10px;font-size:15px;box-sizing:border-box;margin-top:4px;"></label>
          <button type="submit" style="width:100%;background:${CORAL};color:#fff;border:none;padding:13px;border-radius:24px;font-weight:700;font-size:15px;cursor:pointer;">Request new date</button>
        </form>
      </div>
    </details>
  </td></tr>`
    : requested
    ? `
  <tr><td style="padding:22px 30px 30px;text-align:center;border-top:1px solid ${LINE};">
    <div style="font-size:13px;color:${BODY};line-height:1.6;max-width:360px;margin:0 auto;">We've got your request and will text you shortly to confirm the new date. Need to reach us sooner?</div>
    <a href="sms:${SMS_NUMBER}" style="display:inline-block;margin-top:10px;font-size:13px;color:${MUTED};text-decoration:underline;">Text us at ${BUSINESS_PHONE}</a>
  </td></tr>`
    : "";

  // Booking agreement: loud until it's signed, a quiet link once it is.
  const contractUrl = eventId && token ? `${BASE_URL}/api/status?action=contract&eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}` : "";
  const contractBlock = !contractUrl || !active
    ? ""
    : b.contractSignedAt
    ? `
  <tr><td style="padding:14px 30px 6px;text-align:center;">
    <a href="${contractUrl}" style="font-size:13px;color:${MUTED};text-decoration:underline;">✍️ Agreement signed by ${esc(b.contractSignedName || b.client || "you")} · view or print</a>
  </td></tr>`
    : `
  <tr><td style="padding:18px 30px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3ec;border-left:4px solid ${CORAL_RED};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:14px;font-weight:800;color:${INK};">📝 Please sign your booking agreement</div>
        <p style="font-size:14px;color:${BODY};line-height:1.6;margin:8px 0 14px;">Already filled in with your details. Read it, type your name, tap sign — about a minute.</p>
        ${ctaButton(contractUrl, "Review &amp; sign")}
      </td></tr>
    </table>
  </td></tr>`;

  const inner = `
  ${heroBanner({ bg: s.bg, icon: s.icon, title: s.title, subtitle: s.note })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Here's the latest on your face painting booking:</p>
  </td></tr>
  <tr><td style="padding:18px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  ${active && !requested && b.date && b.time ? `<tr><td style="padding:22px 30px 6px;text-align:center;">${ctaButton(addToCalendarUrl(b), "Add to Calendar")}</td></tr>` : ""}
  ${contractBlock}
  ${addressBlock}
  ${rescheduleBlock}`;
  return shell({ preheader: `Your booking status: ${s.title}`, inner });
}

// ── 4b. Printable receipt (schools/companies often need one on file) ─────────
// Deliberately built as a plain formal document rather than reusing the
// colorful email shell — a school submitting this for reimbursement or a
// company filing it with accounting expects something that reads as a
// receipt, not a marketing email. `b` is a normalized booking (see
// parseEventToBooking); `token` is only used to build the "view online" link.
function receiptTodayPacific() {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return fmtDate(iso);
}

const RECEIPT_STATUS = {
  CONFIRMED: { label: "Confirmed", color: GREEN, note: "Balance due on the day of the event. Thank you for choosing Face Painting California!" },
  PENDING: { label: "Pending — not yet confirmed", color: CORAL_RED, note: "This is a summary of a pending request. It is not a confirmed booking — you'll receive a separate confirmation once our team approves it." },
  "RESCHEDULE REQUESTED": { label: "Reschedule requested", color: CORAL_RED, note: "A new date has been requested for this booking and is awaiting confirmation. Balance due on the day of the event once confirmed." },
  CANCELLED: { label: "Cancelled", color: MUTED, note: "This booking was cancelled. No amount is due." },
};

// Shared stylesheet for the "formal document" pages (receipt, agreement):
// plain paper on the site's cream background, print-friendly.
function paperCss() {
  return `
  @page{margin:0.6in}
  *{box-sizing:border-box}
  body{margin:0;background:${PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};padding:32px 16px}
  .toolbar{max-width:640px;margin:0 auto 14px;text-align:right}
  .toolbar button{background:${CORAL};color:#fff;border:none;padding:10px 20px;border-radius:22px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
  .paper{max-width:640px;margin:0 auto;background:#fff;border:1px solid ${LINE};border-radius:6px;padding:44px 48px}
  .letterhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${CORAL};padding-bottom:20px;margin-bottom:26px;gap:20px}
  .brand-name{font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;color:${INK}}
  .brand-meta{font-size:12.5px;color:${BODY};margin-top:6px;line-height:1.6}
  .doc-title{text-align:right;flex-shrink:0}
  .doc-title h1{font-family:Georgia,'Times New Roman',serif;font-size:25px;margin:0;letter-spacing:.3px;color:${INK}}
  .doc-meta{font-size:12px;color:${MUTED};margin-top:6px;line-height:1.6}
  .status{display:inline-block;font-size:11px;font-weight:700;padding:4px 11px;border-radius:12px;text-transform:uppercase;letter-spacing:.4px;color:#fff;margin-top:8px}
  .two-col{display:flex;gap:36px;margin-bottom:30px;flex-wrap:wrap}
  .col{flex:1;min-width:180px}
  .col h3{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};margin:0 0 8px;font-weight:700}
  .col p{margin:0;font-size:14.5px;line-height:1.65;color:${INK}}
  table.items{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.items th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:${MUTED};border-bottom:1px solid ${LINE};padding:0 0 9px;font-weight:700}
  table.items td{padding:15px 0;border-bottom:1px solid ${LINE};font-size:14.5px;color:${INK}}
  table.items th.amt,table.items td.amt{text-align:right;white-space:nowrap}
  .total-row td{border-bottom:none;padding-top:16px;font-weight:800;font-size:17px}
  .total-row .amt{color:${CORAL_RED}}
  .footnote{font-size:12.5px;color:${MUTED};margin-top:22px;line-height:1.7;border-top:1px solid ${LINE};padding-top:16px}
  @media screen and (max-width:560px){
    body{padding:14px 10px}
    .toolbar{margin-bottom:10px}
    .paper{padding:26px 18px;border-radius:8px}
    .letterhead{flex-direction:column;gap:14px;padding-bottom:16px;margin-bottom:20px}
    .doc-title{text-align:left}
    .doc-title h1{font-size:22px}
    .brand-name{font-size:19px}
    .two-col{gap:20px;margin-bottom:22px}
    .col p{font-size:14px}
    table.items td{font-size:14px;padding:12px 0}
  }
  .print-hint{font-size:12px;color:${MUTED};margin-top:6px}
  table.sheet{width:100%;border-collapse:collapse}
  table.sheet td{padding:0;border:0;vertical-align:top}
  table.sheet tfoot{display:none}
  @media print{
    @page{margin:0.6in}
    body{background:#fff;padding:0;color:#000}
    .toolbar{display:none}
    .paper{box-shadow:none;border:none;margin:0;max-width:none;padding:0}
    /* Grey that reads fine on a screen comes out faint on an inkjet. */
    .brand-meta,.col p,table.items td,.footnote{color:#000}
    .doc-meta,.col h3,table.items th{color:#444}
    .letterhead,.two-col,table.items,.footnote{break-inside:avoid;page-break-inside:avoid}
    /* Repeats at the foot of every page (position:fixed prints per page), so a
       loose sheet can always be matched back to its booking. */
    table.sheet tfoot{display:table-footer-group}
    .print-foot{display:flex;justify-content:space-between;gap:16px;margin-top:22px;padding-top:8px;border-top:1px solid #ddd;font-size:10px;color:#555;letter-spacing:.2px}
    .print-foot span:last-child{white-space:nowrap}
  }
`;
}

export function receiptHtml(b) {
  const status = (b.status || "PENDING").toUpperCase();
  const s = RECEIPT_STATUS[status] || RECEIPT_STATUS.PENDING;
  const eid = (b.eventId || "").replace(/[^a-zA-Z0-9]/g, "");
  const receiptNo = (eid.slice(-8) || "000000").toUpperCase();

  const billedTo = b.organization
    ? `<strong>${esc(b.organization)}</strong><br>${esc(b.client || "")}`
    : `<strong>${esc(b.client || "")}</strong>`;
  const contactLines = [b.email, fmtPhone(b.phone)].filter(Boolean).map(esc).join("<br>");

  const eventLine = [b.eventType, b.occasion].filter(Boolean).join(" — ");
  const whenLine = [fmtDate(b.date), fmtTimeRange(b.time)].filter(Boolean).join(", ");

  const description = [
    b.eventType || "Face painting",
    b.guests ? `${b.guests} guests` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt — Face Painting California</title>
<style>${paperCss()}</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨 Print</button><div class="print-hint">For a clean copy, untick "Headers and footers" in the print dialog.</div></div>
  <table class="sheet"><tfoot><tr><td><div class="print-foot"><span>${esc(LEGAL_NAME)} · Face Painting California · Receipt No. ${esc(receiptNo)} · ${esc(b.client || "")}</span><span>Issued ${esc(receiptTodayPacific())}</span></div></td></tr></tfoot><tbody><tr><td>
  <div class="paper">
    <div class="letterhead">
      <div>
        <div class="brand-name">Face Painting California</div>
        <div class="brand-meta">${esc(LEGAL_NAME)}<br>${esc(BUSINESS_PHONE)}<br>${esc(BUSINESS_EMAIL)}<br>Serving Marin County, San Francisco &amp; Santa Rosa</div>
      </div>
      <div class="doc-title">
        <h1>Receipt</h1>
        <div class="doc-meta">No. ${esc(receiptNo)}<br>Issued ${esc(receiptTodayPacific())}</div>
        <div class="status" style="background:${s.color}">${esc(s.label)}</div>
      </div>
    </div>

    <div class="two-col">
      <div class="col">
        <h3>Billed to</h3>
        <p>${billedTo}${contactLines ? `<br>${contactLines}` : ""}</p>
      </div>
      <div class="col">
        <h3>Event</h3>
        <p>${esc(eventLine) || "&mdash;"}<br>${esc(whenLine)}${b.location ? `<br>${esc(b.location)}` : ""}</p>
      </div>
    </div>

    <table class="items">
      <thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
      <tbody>
        <tr><td>${esc(description)}</td><td class="amt">${esc(b.quote) || "&mdash;"}</td></tr>
        <tr class="total-row"><td>Total</td><td class="amt">${esc(b.quote) || "&mdash;"}</td></tr>
      </tbody>
    </table>

    <div class="footnote">${esc(s.note)}</div>
  </div>
  </td></tr></tbody></table>
</body></html>`;
}

// ── 4c. Booking agreement (auto-filled contract with click-to-sign) ─────────
// The same plain-paper look as the receipt. Every field is pre-filled from the
// booking; the client's only job is to read it, type their name and tick the
// box. The typed name + timestamp are stored on the calendar event by
// signContract(), and this page then renders the signature block instead of
// the form. Bump CONTRACT_VERSION whenever the wording of the terms changes,
// so a stored signature always says which version the client agreed to.
export const CONTRACT_VERSION = "2026-08.2"; // .2: Condor Enterprise Group LLC named as the contracting party

// Plain-English terms. Kept as data so the wording is easy to edit in one
// place. Each entry: [heading, paragraph].
export const CONTRACT_TERMS = [
  [
    "What we're providing",
    "A professional face painting artist for the date, time and location above. Your artist arrives about 15 minutes early to set up, and setup and packing up happen outside your booked painting time. Speed depends on the designs chosen: one artist typically paints 10 to 12 children an hour with detailed designs, more with simple ones. If you're expecting a bigger crowd than you told us, let us know ahead of time so we can add hours or a second artist.",
  ],
  [
    "Price and payment",
    "The total shown above is the full price for this booking, including travel. No deposit is required. The balance is due on the day of the event, at or before the end of the booked time, by cash or a payment method we've agreed on together. If your event is a school or company booking that needs an invoice or receipt, we're happy to provide one.",
  ],
  [
    "Staying longer",
    "If the line is still going and your artist is free to stay, extra time is welcome at $100 per additional hour ($50 per half hour), payable the same day. Your artist will check with you before the booked time ends rather than assume.",
  ],
  [
    "Rescheduling and cancellation",
    "Life happens. You can move your date free of charge by texting us at least 48 hours before the event, and we'll find another date together. If you cancel with less than 48 hours' notice, or the event doesn't go ahead when your artist arrives, the full booked amount is due, since we've held that time for you and turned away other bookings. If we ever have to cancel on our side (illness or an emergency), we'll offer a replacement artist or a new date at the same price, and you owe nothing if neither works for you.",
  ],
  [
    "Weather and the space",
    "For outdoor events, please have a shaded or covered spot in mind, ideally with a table and two chairs and somewhere nearby to rinse water. Our paints are water-based, so rain or heavy wind makes painting impossible and unsafe for the artwork. If the weather makes your event unworkable, we reschedule free of charge.",
  ],
  [
    "Health and safety",
    "We use professional, FDA-compliant, hypoallergenic water-based face paints that come off with soap and water. For everyone's safety your artist will not paint anyone with open cuts, rashes, cold sores, sunburn, lice, or who appears unwell, and may decline to paint any child who doesn't want to be painted. If anyone has a known skin sensitivity or allergy, please tell the artist before they sit down. A quick patch test on the hand is always available on request.",
  ],
  [
    "Supervision",
    "Parents and guardians remain responsible for their children at all times. Your artist paints; they can't supervise the line or the party. If the space becomes unsafe or a child is very upset, your artist may pause until things settle.",
  ],
  [
    "Photos",
    "We love showing off finished designs. Unless you tell us otherwise before the event, we may photograph completed artwork for our portfolio and social media. We never share names or details about your event, and we're glad to skip photos altogether if you'd prefer.",
  ],
  [
    "Responsibility",
    "We take care with every face we paint and are responsible for our own conduct and materials. Because our paints are hypoallergenic and safe when used as directed, we can't be held responsible for reactions from allergies or conditions we weren't told about, or for paint on clothing (it washes out, but we can't guarantee every fabric).",
  ],
  [
    "The whole agreement",
    "This agreement, together with your booking confirmation, is the complete arrangement between us. Any change we agree to by text or email counts, as long as we've confirmed it back to you. Your signature below, whether typed online or written on paper, means you agree to these terms.",
  ],
];

const CONTRACT_STATUS = {
  SIGNED: { label: "Signed", color: GREEN },
  UNSIGNED: { label: "Awaiting signature", color: CORAL_RED },
  CANCELLED: { label: "Cancelled", color: MUTED },
};

// "2026-08-17T20:14:03.000Z" -> "August 17, 2026 at 1:14 PM PT"
export function fmtSignedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d) + " PT"
  );
}

/**
 * Inlines the client's drawn signature as a data URI on the booking (as
 * `contractSignatureDataUrl`) so a printed copy never shows a broken image if
 * the Blob URL is slow or unreachable at print time. Best effort: on any
 * failure the page falls back to the remote URL. Small and bounded (signature
 * PNGs are a few KB; anything over 400 KB is left as a link).
 */
export async function withInlineSignature(b) {
  const url = b?.contractSignatureUrl;
  if (!url || b.contractSignatureDataUrl) return b;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return b;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 400_000) return b;
    const type = res.headers.get("content-type") || "image/png";
    return { ...b, contractSignatureDataUrl: `data:${type};base64,${buf.toString("base64")}` };
  } catch (e) {
    console.warn("Signature inline skipped:", e?.message || e);
    return b;
  }
}

/**
 * The booking agreement page. `b` is a normalized booking; pass `eventId` +
 * `token` (the same client HMAC that gated the page) to render the sign form.
 * `error` is a short message shown above the form after a failed submit.
 * `paper` renders a filled-in copy with signature lines for signing by hand
 * (the dashboard's quick agreement: details typed by the owner, no booking
 * on the calendar behind it, so nothing to sign online).
 */
export function contractHtml(b, { eventId, token, error = "", blank = false, paper = false, edit = false, clients = [], backHref = "", autoPrint = false } = {}) {
  // Edit mode is the blank form with live inputs; on paper it's the same
  // "sign on paper" contract as a filled-in one, so it borrows paper's status.
  if (edit) { blank = false; paper = true; }
  const status = (b.status || "PENDING").toUpperCase();
  const cancelled = !blank && !paper && status === "CANCELLED";
  const signed = !blank && !paper && !!b.contractSignedAt;
  const s = blank
    ? { label: "Blank form", color: MUTED }
    : paper
    ? { label: "Sign on paper", color: CORAL_RED }
    : cancelled
    ? CONTRACT_STATUS.CANCELLED
    : signed
    ? CONTRACT_STATUS.SIGNED
    : CONTRACT_STATUS.UNSIGNED;
  const eid = (b.eventId || "").replace(/[^a-zA-Z0-9]/g, "");
  const docNo = blank || (paper && !eid) ? "________" : (eid.slice(-8) || "000000").toUpperCase();
  const canSign = !blank && !paper && !cancelled && !signed && eventId && token;

  // Blank mode: the same document with write-in lines instead of booking data,
  // for signing on paper (at the event, or for a school that wants a hard copy).
  const line = (w = "100%") => `<span class="wl" style="width:${w}"></span>`;
  const wi = (name, placeholder, extra = "") => `<input class="wi" name="${name}" placeholder="${placeholder}" autocomplete="off" ${extra}>`;
  const clientBlock = edit
    ? `<label class="wl-row"><span>Name</span>${wi("clientName", "Client name")}</label><label class="wl-row"><span>Organization</span>${wi("organization", "optional")}</label>`
    : blank
    ? `Name ${line("70%")}<br>Organization ${line("58%")}`
    : b.organization
    ? `<strong>${esc(b.organization)}</strong><br>${esc(b.client || "")}`
    : `<strong>${esc(b.client || "")}</strong>`;
  const contactLines = edit
    ? `<label class="wl-row"><span>Phone</span>${wi("clientPhone", "", 'type="tel"')}</label><label class="wl-row"><span>Email</span>${wi("clientEmail", "", 'type="email"')}</label>`
    : blank
    ? `Phone ${line("72%")}<br>Email ${line("74%")}`
    : [b.email, fmtPhone(b.phone)].filter(Boolean).map(esc).join("<br>");

  const rows = blank || edit
    ? []
    : [
        ["Event", [b.eventType, b.occasion].filter(Boolean).join(" — ")],
        ["Date", fmtDate(b.date)],
        ["Time", fmtTimeRange(b.time)],
        ["Location", b.location || "To be confirmed — send it from your booking page"],
        ["Total", b.quote],
      ].filter(([, v]) => v);

  const termHtml = ([h, p], i) => `<div class="term"><h4>${i + 1}. ${esc(h)}</h4><p>${esc(p)}</p></div>`;
  // The final term is rendered inside the signature wrapper (see below) so
  // print keeps it on the same page as the signature block.
  const termsHtml = CONTRACT_TERMS.slice(0, -1).map(termHtml).join("");
  const lastTermHtml = termHtml(CONTRACT_TERMS[CONTRACT_TERMS.length - 1], CONTRACT_TERMS.length - 1);

  let signatureBlock;
  if (blank || paper) {
    signatureBlock = `
      <div class="paper-sig">
        <div class="ps-row"><div class="ps-cell wide"><div class="ps-line"></div><div class="ps-cap">Client signature</div></div><div class="ps-cell"><div class="ps-line"></div><div class="ps-cap">Date</div></div></div>
        <div class="ps-row"><div class="ps-cell wide"><div class="ps-line"></div><div class="ps-cap">Client name (printed)</div></div></div>
        <div class="ps-row"><div class="ps-cell wide"><div class="ps-line"></div><div class="ps-cap">For ${esc(LEGAL_NAME)}</div></div><div class="ps-cell"><div class="ps-line"></div><div class="ps-cap">Date</div></div></div>
        <div class="sig-note">Terms version ${esc(CONTRACT_VERSION)}. Both sides keep a copy.</div>
      </div>`;
  } else if (cancelled) {
    signatureBlock = `<div class="sig-note">This booking was cancelled, so there is nothing to sign.</div>`;
  } else if (signed) {
    signatureBlock = `
      <div class="signed">
        ${b.contractSignatureUrl ? `<div class="sig-row"><span class="sig-k">Signature</span><span class="sig-v"><img class="sig-img" src="${esc(b.contractSignatureDataUrl || b.contractSignatureUrl)}" alt="Signature of ${esc(b.contractSignedName || b.client || "client")}"></span></div>` : ""}
        <div class="sig-row"><span class="sig-k">${b.contractSignatureUrl ? "Name" : "Signed by"}</span><span class="sig-v sig-name">${esc(b.contractSignedName || b.client || "")}</span></div>
        <div class="sig-row"><span class="sig-k">On</span><span class="sig-v">${esc(fmtSignedAt(b.contractSignedAt))}</span></div>
        <div class="sig-row"><span class="sig-k">For</span><span class="sig-v">${esc(LEGAL_NAME)}</span></div>
        <div class="sig-note">Signed electronically. Terms version ${esc(b.contractVersion || CONTRACT_VERSION)}. Keep or print this page for your records.</div>
      </div>`;
  } else if (canSign) {
    signatureBlock = `
      <form method="POST" action="${BASE_URL}/api/status?action=contract" class="sign">
        <input type="hidden" name="eventId" value="${esc(eventId)}">
        <input type="hidden" name="token" value="${esc(token)}">
        <input type="hidden" name="version" value="${esc(CONTRACT_VERSION)}">
        ${error ? `<div class="err">${esc(error)}</div>` : ""}
        <label class="sig-label">Your full name
          <input type="text" name="name" required maxlength="120" autocomplete="name" placeholder="${esc(b.client || "Type your full name")}" value="${esc(b.client || "")}">
        </label>
        <div class="sig-label">Draw your signature
          <div id="sigpad-wrap" class="pad-wrap">
            <canvas id="sigpad" class="pad" aria-label="Signature pad: draw your signature with your finger or mouse"></canvas>
            <span class="pad-hint">Sign here with your finger or mouse</span>
            <button type="button" id="sigclear" class="pad-clear">Clear</button>
          </div>
          <div id="sigerr" class="err" style="display:none">Please draw your signature in the box above.</div>
        </div>
        <input type="hidden" name="signature" id="sigdata" value="">
        <label class="agree"><input type="checkbox" name="agree" value="yes" required> I've read this agreement and I agree to it.</label>
        <button type="submit">Sign agreement</button>
        <div class="sig-note">Your drawn signature and typed name together are your electronic signature. You'll be able to print or save the signed copy right after.</div>
      </form>
      <script>
      (function(){
        var c=document.getElementById('sigpad'); if(!c) return;
        var ctx=c.getContext('2d'), wrap=document.getElementById('sigpad-wrap'), err=document.getElementById('sigerr');
        var drawing=false, has=false, last=null;
        function setup(){
          var r=c.getBoundingClientRect(), d=window.devicePixelRatio||1;
          var keep=has?c.toDataURL():null;
          c.width=Math.round(r.width*d); c.height=Math.round(r.height*d);
          ctx.setTransform(d,0,0,d,0,0);
          ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#2d3540';
          if(keep){ var i=new Image(); i.onload=function(){ ctx.drawImage(i,0,0,r.width,r.height); }; i.src=keep; }
        }
        function pos(e){ var r=c.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; }
        function mark(){ has=true; wrap.classList.add('has'); err.style.display='none'; }
        c.addEventListener('pointerdown',function(e){ e.preventDefault(); drawing=true; last=pos(e); try{c.setPointerCapture(e.pointerId);}catch(_){} ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(last.x+0.01,last.y+0.01); ctx.stroke(); mark(); });
        c.addEventListener('pointermove',function(e){ if(!drawing) return; e.preventDefault(); var p=pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; });
        function stop(){ drawing=false; }
        c.addEventListener('pointerup',stop); c.addEventListener('pointercancel',stop); c.addEventListener('pointerleave',stop);
        document.getElementById('sigclear').addEventListener('click',function(){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,c.width,c.height); ctx.restore(); has=false; wrap.classList.remove('has'); });
        var t; window.addEventListener('resize',function(){ clearTimeout(t); t=setTimeout(setup,150); });
        setup();
        document.querySelector('form.sign').addEventListener('submit',function(e){
          if(!has){ e.preventDefault(); err.style.display='block'; c.scrollIntoView({block:'center',behavior:'smooth'}); return; }
          document.getElementById('sigdata').value=c.toDataURL('image/png');
        });
      })();
      </script>`;
  } else {
    signatureBlock = `<div class="sig-note">Awaiting signature.</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${edit ? "Fill in an agreement" : "Booking Agreement"} — Face Painting California</title>
<style>${paperCss()}
  /* Edit mode: write-in lines that you can type on. */
  .wi{font:inherit;font-size:14.5px;color:${INK};background:#fffdf7;border:0;border-bottom:1px solid ${INK};border-radius:0;padding:2px 4px;min-width:0;width:100%;outline:none}
  .wi:focus{background:#fff4ec;box-shadow:0 2px 0 ${CORAL}}
  .wi::placeholder{color:#b8b0a6;font-style:italic}
  .wl-row{display:flex;align-items:baseline;gap:8px;margin:0 0 7px;font-size:14.5px;color:${INK}}
  .wl-row span{flex-shrink:0}
  .fb-time{flex:1;display:flex;align-items:baseline;gap:6px}
  .fb-time .dash{color:${MUTED}}
  .fb .wi{flex:1}
  .edit-bar{max-width:640px;margin:0 auto 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .edit-bar select{flex:1;min-width:200px;font:inherit;font-size:15px;padding:10px 12px;border:1px solid ${LINE};border-radius:12px;background:#fff;color:${INK}}
  .edit-bar .ghost{background:#fff;color:${BODY};border:1px solid ${LINE};padding:10px 16px;border-radius:22px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;text-decoration:none}
  .edit-bar .print-hint{flex-basis:100%;margin:0}
  .wi::-webkit-calendar-picker-indicator{opacity:.5}
  @media print{
    .wi{background:none;box-shadow:none;color:#000;border-bottom-color:#000}
    .wi::placeholder{color:transparent}
    .wi::-webkit-calendar-picker-indicator{display:none}
    /* Empty date/time pickers would print their "mm/dd/yyyy" hint; beforeprint tags them. */
    .wi.is-empty{color:transparent}
    .edit-bar{display:none}
  }
  .intro{font-size:14.5px;line-height:1.7;color:${INK};margin:0 0 22px}
  table.facts{width:100%;border-collapse:collapse;margin-bottom:28px}
  table.facts td{padding:9px 0;border-bottom:1px solid ${LINE};font-size:14.5px;color:${INK};vertical-align:top}
  table.facts td.k{width:110px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};font-weight:700;padding-top:12px}
  table.facts td.total{font-weight:800;color:${CORAL_RED}}
  /* Blank form: write-in lines in two columns, same look as the Client block
     above, so the booking details take three rows instead of six. */
  .facts-blank{display:grid;grid-template-columns:1fr 1fr;column-gap:36px;row-gap:22px;margin-bottom:30px}
  .fb{display:flex;align-items:flex-end;gap:8px;font-size:14.5px;color:${INK}}
  .fb.wide{grid-column:1 / -1}
  .fb-k{flex-shrink:0}
  .fb-l{flex:1;border-bottom:1px solid ${INK};height:18px}
  .fb.wide .fb-l{height:18px}
  .terms h3{font-family:Georgia,'Times New Roman',serif;font-size:18px;margin:0 0 14px;color:${INK}}
  .term{margin-bottom:16px}
  .term h4{font-size:13.5px;margin:0 0 4px;color:${INK}}
  .term p{margin:0;font-size:13.5px;line-height:1.7;color:${BODY}}
  .signature{margin-top:30px;border-top:3px solid ${CORAL};padding-top:20px}
  .signature h3{font-family:Georgia,'Times New Roman',serif;font-size:18px;margin:0 0 14px;color:${INK}}
  .sign label{display:block;font-size:13px;color:${BODY};margin-bottom:12px}
  .sign input[type=text]{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid ${LINE};border-radius:10px;font-size:18px;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:${INK}}
  .sign .agree{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:${INK};margin:14px 0 18px;line-height:1.5}
  .sign .agree input{margin-top:3px;width:18px;height:18px;flex-shrink:0}
  .sign button[type=submit]{background:${CORAL};color:#fff;border:none;padding:14px 28px;border-radius:26px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;width:100%}
  .sign .err{background:#fdf3ec;border-left:4px solid ${CORAL_RED};color:${INK};padding:10px 14px;border-radius:8px;font-size:13.5px;margin-bottom:14px}
  .pad-wrap{position:relative;margin-top:6px;background:#fff;border:1px solid ${LINE};border-radius:10px;overflow:hidden}
  .pad{display:block;width:100%;height:170px;touch-action:none;cursor:crosshair}
  .pad-hint{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:${MUTED};pointer-events:none}
  .pad-wrap.has .pad-hint{display:none}
  .pad-wrap:before{content:"";position:absolute;left:24px;right:24px;bottom:34px;border-bottom:1px dashed ${LINE};pointer-events:none}
  .pad-clear{position:absolute;right:10px;bottom:8px;background:${PAGE};color:${BODY};border:1px solid ${LINE};border-radius:14px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
  .sig-img{display:block;max-width:320px;width:100%;height:auto;margin:2px 0 6px}
  .signed .sig-row{display:flex;gap:16px;padding:8px 0;border-bottom:1px solid ${LINE};font-size:14.5px}
  .sig-k{flex:0 0 90px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};font-weight:700;padding-top:3px}
  .sig-name{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:22px;color:${INK}}
  .sig-note{font-size:12.5px;color:${MUTED};margin-top:14px;line-height:1.7}
  .wl{display:inline-block;border-bottom:1px solid ${INK};height:16px;vertical-align:baseline;margin-left:4px}
  .paper-sig .ps-row{display:flex;gap:28px;margin-top:34px}
  .paper-sig .ps-cell{flex:1}
  .paper-sig .ps-cell.wide{flex:2.4}
  .paper-sig .ps-line{border-bottom:1px solid ${INK};height:26px}
  .paper-sig .ps-cap{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${MUTED};font-weight:700;margin-top:6px}
  @media screen and (max-width:560px){
    .intro{font-size:14px;margin-bottom:18px}
    table.facts td.k{width:82px;font-size:10.5px}
    .facts-blank{grid-template-columns:1fr;row-gap:18px;column-gap:0}
    table.facts td{font-size:14px}
    .term p{font-size:14px}
    .sign input[type=text]{font-size:17px}
    .sign button[type=submit]{padding:15px 20px;font-size:16px}
    .pad{height:150px}
    .signed .sig-row{gap:12px}
    .sig-k{flex:0 0 74px}
    .sig-name{font-size:20px}
    .paper-sig .ps-row{gap:16px;margin-top:30px}
    .paper-sig .ps-cell.wide{flex:1.8}
    .wl{min-width:90px}
  }
  @media print{
    .sign button{display:none}
    .sig-img{max-width:280px}
    .intro,table.facts td,.term h4,.signed .sig-row,.sig-name,.wl{color:#000}
    .term p,.sig-note,.paper-sig .ps-cap,table.facts td.k,.sig-k{color:#222}
    .term{break-inside:avoid;page-break-inside:avoid}
    .term h4,.terms h3,.signature h3{break-after:avoid;page-break-after:avoid}
    /* The signature block never sits alone on its own page: it's kept whole and
       pulled up with the last term so both land together. */
    .keep,.signature,table.facts,.facts-blank,.paper-sig .ps-row{break-inside:avoid;page-break-inside:avoid}
    .facts-blank{row-gap:16px;margin-bottom:18px;font-size:13px}
    .paper-sig .ps-row{margin-top:20px}
    .paper-sig .ps-line{height:22px}
    .paper-sig .sig-note{margin-top:8px}
    .fb-l{border-color:#000}
    .signature{margin-top:20px;padding-top:14px}
    .intro{font-size:13px;line-height:1.55;margin-bottom:16px}
    .two-col{margin-bottom:20px}
    table.facts{margin-bottom:20px}
    table.facts td{padding:7px 0;font-size:13px}
    .term{margin-bottom:10px}
    .term h4{font-size:12.5px;margin-bottom:2px}
    .term p{font-size:12.5px;line-height:1.45}
    .terms h3{margin-bottom:8px}
  }
</style></head>
<body>
  ${edit
    ? `<div class="edit-bar">
    ${backHref ? `<a class="ghost" href="${esc(backHref)}">‹ Dashboard</a>` : ""}
    <select id="ag-client" aria-label="Fill in from an existing client"><option value="">Fill in from a client…</option>${clients.map((p, i) => `<option value="${i}">${esc([p.name, p.organization].filter(Boolean).join(" · "))}</option>`).join("")}</select>
    <button type="button" class="ghost" id="ag-clear">Clear</button>
    <button class="print-btn" onclick="window.print()" style="background:${CORAL};color:#fff;border:none;padding:10px 20px;border-radius:22px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">🖨 Print</button>
    <div class="print-hint">Tap any line to type. For a clean copy, untick "Headers and footers" in the print dialog.</div>
  </div>`
    : `<div class="toolbar"><button onclick="window.print()">🖨 Print</button><div class="print-hint">For a clean copy, untick "Headers and footers" in the print dialog.</div></div>`}
  <table class="sheet"><tfoot><tr><td><div class="print-foot"><span>${esc(LEGAL_NAME)} · Face Painting California · Booking Agreement No. ${esc(docNo)}${blank ? "" : ` · ${esc(b.client || "")}${b.date ? ` · ${esc(fmtDate(b.date))}` : ""}`}</span><span>Terms v${esc(blank ? CONTRACT_VERSION : b.contractVersion || CONTRACT_VERSION)}${signed ? " · Signed electronically" : ""}</span></div></td></tr></tfoot><tbody><tr><td>
  <div class="paper">
    <div class="letterhead">
      <div>
        <div class="brand-name">Face Painting California</div>
        <div class="brand-meta">${esc(LEGAL_NAME)}<br>${esc(BUSINESS_PHONE)}<br>${esc(BUSINESS_EMAIL)}<br>Serving Marin County, San Francisco &amp; Santa Rosa</div>
      </div>
      <div class="doc-title">
        <h1>Booking Agreement</h1>
        <div class="doc-meta">No. ${esc(docNo)}<br>Terms v${esc(CONTRACT_VERSION)}</div>
        <div class="status" style="background:${s.color}">${esc(s.label)}</div>
      </div>
    </div>

    <p class="intro">This agreement is between <strong>${esc(LEGAL_NAME)}</strong> ("we", "us"), providing face painting services as <em>Face Painting California</em>, and the client below ("you") for the booking described here. It's written in plain English on purpose: it's meant to be read, not just signed.</p>

    <div class="two-col">
      <div class="col">
        <h3>Client</h3>
        <p>${clientBlock}${contactLines ? `${edit ? "" : "<br>"}${contactLines}` : ""}</p>
      </div>
      <div class="col">
        <h3>Provider</h3>
        <p><strong>${esc(LEGAL_NAME)}</strong><br>Face Painting California<br>${esc(BUSINESS_PHONE)}<br>${esc(BUSINESS_EMAIL)}</p>
      </div>
    </div>

    ${edit
      ? `<div class="facts-blank">
      <label class="fb"><span class="fb-k">Event</span>${wi("eventType", "e.g. Birthday party")}</label>
      <label class="fb"><span class="fb-k">Date</span>${wi("date", "", 'type="date"')}</label>
      <label class="fb"><span class="fb-k">Time</span><span class="fb-time">${wi("startTime", "", 'type="time"')}<span class="dash">–</span>${wi("endTime", "", 'type="time"')}</span></label>
      <label class="fb"><span class="fb-k">Total</span>${wi("quote", "e.g. $300", 'inputmode="decimal"')}</label>
      <label class="fb wide"><span class="fb-k">Location</span>${wi("location", "Address")}</label>
    </div>`
      : blank
      ? `<div class="facts-blank">
      <div class="fb"><span class="fb-k">Event</span><span class="fb-l"></span></div>
      <div class="fb"><span class="fb-k">Date</span><span class="fb-l"></span></div>
      <div class="fb"><span class="fb-k">Time</span><span class="fb-l"></span></div>
      <div class="fb"><span class="fb-k">Total</span><span class="fb-l"></span></div>
      <div class="fb wide"><span class="fb-k">Location</span><span class="fb-l"></span></div>
    </div>`
      : `<table class="facts">
      ${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td${k === "Total" ? ' class="total"' : ""}>${esc(v)}</td></tr>`).join("")}
    </table>`}

    <div class="terms">
      <h3>Terms</h3>
      ${termsHtml}
    </div>

    <div class="keep">
      <div class="terms">${lastTermHtml}</div>
      <div class="signature">
        <h3>${signed ? "Signature" : blank || paper ? "Signatures" : "Sign here"}</h3>
        ${signatureBlock}
      </div>
    </div>
  </div>
  </td></tr></tbody></table>
  ${edit ? `<script id="ag-data" type="application/json">${JSON.stringify(clients).replace(/</g, "\\u003c")}</script>
  <script>
  (function(){
    var people = JSON.parse(document.getElementById('ag-data').textContent || '[]');
    var sel = document.getElementById('ag-client');
    var map = { clientName:'name', organization:'organization', clientPhone:'phone', clientEmail:'email', eventType:'eventType', location:'location', quote:'quote' };
    function byName(n){ return document.querySelector('.wi[name="' + n + '"]'); }
    sel.addEventListener('change', function(){
      var p = sel.value === '' ? null : people[+sel.value];
      for (var f in map) { var el = byName(f); if (el) el.value = p ? (p[map[f]] || '') : ''; }
      var d = byName('date'); if (p && d && !d.value) d.focus();
    });
    document.getElementById('ag-clear').addEventListener('click', function(){
      document.querySelectorAll('.wi').forEach(function(el){ el.value = ''; }); sel.value = '';
    });
    function tagEmpty(){ document.querySelectorAll('.wi').forEach(function(el){ el.classList.toggle('is-empty', !el.value); }); }
    window.addEventListener('beforeprint', tagEmpty); tagEmpty();
    document.addEventListener('input', function(e){ if (e.target.classList && e.target.classList.contains('wi')) e.target.classList.toggle('is-empty', !e.target.value); });
  })();
  </script>` : ""}
  ${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})</script>` : ""}
</body></html>`;
}

// ── 4c-ii. Client: here's your agreement (sent on request from the dashboard) ─
// For clients who ask for the contract, or didn't spot the callout in their
// booking email. Unsigned: asks them to review and sign. Signed: a copy.
export function agreementRequestHtml(b, { contractUrl }) {
  const signed = !!b.contractSignedAt;
  const rows = [
    detailRow("Event Date", esc(fmtDate(b.date))),
    b.time ? detailRow("Time", esc(fmtTimeRange(b.time))) : "",
    b.location ? detailRow("Location", esc(b.location)) : "",
    b.quote ? detailRow("Total", esc(b.quote), { valueColor: CORAL, last: true }) : "",
  ].filter(Boolean);
  const inner = `
  ${heroBanner({ bg: CORAL, icon: "📝", title: signed ? "Your Booking Agreement" : "Please Sign Your Agreement", subtitle: signed ? "A copy for your records" : "It's short, and it's already filled in" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">${
      signed
        ? `Here's the booking agreement you signed for your event on <b>${esc(fmtDate(b.date))}</b>. You can view, save or print it anytime from the link below.`
        : `Here's the booking agreement for your event on <b>${esc(fmtDate(b.date))}</b>. It's already filled in with your details and written in plain English. Please read it, draw your signature, type your name and tap sign, it takes about a minute.`
    }</p>
  </td></tr>
  <tr><td style="padding:18px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:22px 30px 6px;text-align:center;">${ctaButton(contractUrl, signed ? "View signed agreement" : "Review &amp; sign")}</td></tr>
  <tr><td style="padding:14px 30px 8px;text-align:center;font-size:13px;color:${MUTED};">Questions? Text us at ${BUSINESS_PHONE}.</td></tr>
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: signed ? "Your signed booking agreement" : "Your booking agreement, ready to sign", inner });
}

// ── 4d. Client: your signed agreement (emailed copy) ─────────────────────────
export function contractSignedCopyHtml(b, { contractUrl }) {
  const inner = `
  ${heroBanner({ bg: GREEN, icon: "✍️", title: "Agreement Signed", subtitle: "A copy for your records" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Thanks for signing your booking agreement for <b>${esc(fmtDate(b.date))}</b>. Signed by <b>${esc(b.contractSignedName || b.client || "")}</b> on ${esc(fmtSignedAt(b.contractSignedAt))}. You can view, save or print it anytime from the link below.</p>
  </td></tr>
  <tr><td style="padding:22px 30px 6px;text-align:center;">${ctaButton(contractUrl, "View signed agreement")}</td></tr>
  <tr><td style="padding:14px 30px 8px;text-align:center;font-size:13px;color:${MUTED};">Questions? Text us at ${BUSINESS_PHONE}.</td></tr>
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: "Your signed booking agreement", inner });
}

// ── 5. Owner: client requested a reschedule ──────────────────────────────────
export function rescheduleRequestHtml(b, { approveUrl, declineUrl, calendarUrl }) {
  const rows = [
    detailRow("Client", esc(b.clientName)),
    b.clientEmail ? detailRow("Email", `<a href="mailto:${esc(b.clientEmail)}" style="color:#2f6fd6;text-decoration:none;">${esc(b.clientEmail)}</a>`) : "",
    b.clientPhone ? detailRow("Phone", esc(b.clientPhone)) : "",
    detailRow("Current date", esc(fmtDate(b.originalDate)) + (b.originalTime ? ` · ${esc(fmtTimeRange(b.originalTime))}` : "")),
    detailRow("Requested date", esc(fmtDate(b.newDate)) + (b.newTime ? ` · ${esc(to12h(b.newTime))}` : ""), { valueColor: CORAL, last: true }),
  ].filter(Boolean);
  const textClient = b.clientPhone ? `sms:${String(b.clientPhone).replace(/[^\d]/g, "")}` : `sms:${SMS_NUMBER}`;
  const inner = `
  <tr><td style="padding:28px 24px 8px;">
    <div style="font-size:20px;font-weight:800;color:${INK};">🔄 Reschedule Requested</div>
  </td></tr>
  <tr><td style="padding:12px 24px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:16px 24px 6px;">
    <a href="${textClient}" style="display:inline-block;background:#fff;border:1px solid #dfe4e6;color:${INK};padding:11px 20px;border-radius:24px;text-decoration:none;font-weight:700;font-size:14px;">💬 Text ${esc(b.clientName || "the client")} first</a>
  </td></tr>
  <tr><td style="padding:14px 24px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;">${ctaButton(approveUrl, "Approve New Date", { bg: GREEN })}</td>
      <td>${ctaButton(declineUrl, "Keep Current Date", { bg: "#f1f1f1", color: CORAL_RED })}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px 4px;font-size:13px;color:${BODY};line-height:1.5;">
    <b>Approve New Date</b> moves the event to the requested date and emails the client their updated confirmation. <b>Keep Current Date</b> clears the request and lets the client know the original date stands.
  </td></tr>
  ${calendarUrl ? `<tr><td style="padding:10px 24px 4px;"><a href="${calendarUrl}" style="color:#2f6fd6;font-weight:700;text-decoration:none;">Open in Google Calendar</a></td></tr>` : ""}
  <tr><td style="padding:16px 24px 26px;font-size:12px;color:${MUTED};">Sky, your Face Painting California assistant</td></tr>`;
  return shell({ preheader: `${b.clientName} wants to move their ${fmtDate(b.originalDate)} booking`, inner });
}

// ── 6. Client: reschedule not accommodated, original date kept ────────────────
export function rescheduleKeptHtml(b) {
  const inner = `
  ${heroBanner({ bg: CORAL, icon: "📅", title: "Your Date Is Still Set", subtitle: "A quick note about your reschedule request" })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Thanks for letting us know you'd hoped to move your party${b.proposedDate ? ` to <b>${esc(fmtDate(b.proposedDate))}</b>` : ""}. Unfortunately we're not able to make that new date work, so your booking stays on <b>${esc(fmtDate(b.date))}</b> as originally planned.</p>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">If that no longer works for you, just text us and we'll find another option together.</p>
  </td></tr>
  <tr><td style="padding:22px 30px 8px;text-align:center;">${ctaButton(`sms:${SMS_NUMBER}`, "💬 Text Us")}</td></tr>
  <tr><td style="height:10px;"></td></tr>`;
  return shell({ preheader: "About your reschedule request", inner });
}

// ── Send ────────────────────────────────────────────────────────────────────
function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

// ── 6. Owner: monthly stats summary (sent by the cron on the 1st) ────────────
export function monthlyStatsHtml(m, prev, { dashboardUrl, reports = [] } = {}) {
  const pct = (n) => (n == null ? "—" : `${Math.round(n * 100)}%`);
  const usd = (n) => "$" + Math.round(n || 0).toLocaleString("en-US");
  const arrow = (cur, old) => {
    if (!old) return "";
    const d = Math.round(((cur - old) / old) * 100);
    return ` <span style="color:${d >= 0 ? "#3D6B48" : "#9A3838"};font-size:12px;">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
  };
  const rows = [
    detailRow("Quotes given", `${m.quotes}${arrow(m.quotes, prev?.quotes)}`),
    detailRow("Bookings", `${m.bookings}${arrow(m.bookings, prev?.bookings)}`),
    detailRow("Quote → booking", pct(m.conversion)),
    detailRow("Booked value", `${usd(m.pipeline)}${arrow(m.pipeline, prev?.pipeline)}`),
    detailRow("Revenue (events that month)", usd(m.revenue)),
    detailRow("Average quote", usd(m.avgQuote), { valueColor: CORAL, last: true }),
  ];
  const links = reports
    .map((r) => `<div style="margin:6px 0;"><a href="${r.href}" style="color:${CORAL_RED};font-weight:700;text-decoration:none;">${esc(r.title)} →</a><div style="font-size:12px;color:${MUTED};">${esc(r.sub)}</div></div>`)
    .join("");
  const inner = `
  ${heroBanner({ bg: INK, icon: "📊", title: `${esc(m.label)} in numbers`, subtitle: "Your monthly summary from Face Painting California" })}
  <tr><td style="padding:22px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:18px 30px 4px;font-size:14px;color:${BODY};line-height:1.6;">
    ${m.topCities?.length ? `<b>Most-quoted cities:</b> ${m.topCities.map(([c, n]) => `${esc(c)} (${n})`).join(" · ")}<br>` : ""}
    ${m.topEventTypes?.length ? `<b>Booked event types:</b> ${m.topEventTypes.map(([c, n]) => `${esc(c)} (${n})`).join(" · ")}` : ""}
  </td></tr>
  <tr><td style="padding:18px 30px 4px;">
    <div style="font-size:13px;font-weight:800;color:${INK};text-transform:uppercase;letter-spacing:.04em;">Traffic &amp; search</div>
    ${links}
  </td></tr>
  <tr><td style="padding:22px 30px 6px;text-align:center;">${ctaButton(dashboardUrl, "Open the Stats page")}</td></tr>
  <tr><td style="height:8px;"></td></tr>`;
  return shell({ preheader: `${m.quotes} quotes, ${m.bookings} bookings, ${usd(m.pipeline)} booked`, inner });
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
