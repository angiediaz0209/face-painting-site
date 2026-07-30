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
  ${heroBanner({
    bg: CORAL,
    icon: "📋",
    title: "We Got Your Request!",
    subtitle: "Our team is checking the date now",
  })}
  <tr><td style="padding:28px 30px 4px;">
    <div style="font-size:17px;font-weight:800;color:${INK};">Hi ${esc((b.client || "there").split(" ")[0])},</div>
    <p style="font-size:15px;color:${BODY};line-height:1.6;margin:14px 0 0;">Thanks for sending this over! Your request is with our team now. We'll check artist availability for your date and get back to you shortly to confirm. <b>Nothing is booked just yet</b> — we'll let you know the moment it is.</p>
  </td></tr>
  <tr><td style="padding:20px 30px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${rows.join("")}</table>
  </td></tr>
  <tr><td style="padding:16px 30px 4px;">
    <div style="font-size:13px;font-weight:800;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;padding-left:4px;margin-bottom:8px;">Your quote</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border-radius:14px;overflow:hidden;">${priceRows.join("")}</table>
    <div style="font-size:13px;color:${MUTED};padding:10px 4px 0;">No payment is needed now. The balance is due on the day of your event.</div>
  </td></tr>
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

  // Discreet by design: a small muted disclosure, not a button. Only offered on a
  // live booking that hasn't already got a request in flight.
  const rescheduleBlock = canRequest
    ? `
  <tr><td style="padding:24px 30px 30px;border-top:1px solid ${LINE};">
    <details style="text-align:center;">
      <summary style="font-size:13px;color:${MUTED};text-decoration:underline;cursor:pointer;">Need to change your date?</summary>
      <div style="max-width:360px;margin:14px auto 0;text-align:left;">
        <p style="font-size:12px;color:${MUTED};line-height:1.6;text-align:center;margin:0 0 14px;">We hold your artist and turn away other bookings for your date, so please reschedule only if you need to.</p>
        <form method="POST" action="/api/reschedule-request">
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
  ${rescheduleBlock}`;
  return shell({ preheader: `Your booking status: ${s.title}`, inner });
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
