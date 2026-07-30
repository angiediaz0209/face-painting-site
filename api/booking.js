// Public endpoint for the website's self-serve booking form.
//
// Two actions live here rather than in two files because the Vercel Hobby plan
// caps the project at 12 serverless functions and we're at the limit. Same
// multiplexing trick api/status.js uses for its opt-out action.
//
//   GET  /api/booking?action=availability&from=YYYY-MM-DD&to=YYYY-MM-DD
//        -> { busyDates: ["2026-08-02", ...] }   dates only, never event details
//   POST /api/booking
//        -> creates a PENDING booking, exactly like Sky does, for team approval
//
// Sky's flow in api/chat.js is untouched: both paths land on the same
// createBooking() and the same approve/decline emails.
import { createBooking, listBusyDates, findDuplicateBooking, artistPrepNote } from "./_lib/book.js";
import { sendBookingNotification } from "./_lib/notify.js";
import { addBookingToSheet, addConversation } from "./_lib/sheets.js";
import { computeQuote } from "./_lib/pricing.js";
import { upsertClient } from "./_lib/clients.js";
import { isSecondArtistAvailable } from "./_lib/sheets.js";
import { sendEmail, clientRequestReceivedHtml } from "./_lib/email.js";
import { getClientIp, isRateLimited } from "./_lib/ratelimit.js";
import { statusUrlFor } from "./_lib/tokens.js";

const MAX_FIELD_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;
const MAX_AVAILABILITY_DAYS = 120;

// Guest bands offered by the form. The server owns this mapping so a caller
// can't invent its own band and dodge the package rules.
const GUEST_BANDS = {
  small: "Up to 12",
  medium: "13-22",
  large: "23+",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function clean(v, max = MAX_FIELD_LENGTH) {
  return String(v ?? "").trim().slice(0, max);
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function phoneDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function endTimeFor(startTime, hours) {
  const m = HHMM.exec(startTime);
  if (!m) return "";
  const end = (Number(m[1]) + Number(hours)) % 24;
  return `${String(end).padStart(2, "0")}:${m[2]}`;
}

// Vercel parses JSON bodies for us; the local dev server in api-dev-server.js
// hands us the raw stream, so support both.
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

// ── GET: which days are already taken ───────────────────────────────────────
async function handleAvailability(req, res, url) {
  if (isRateLimited("availability", getClientIp(req), { max: 40 })) {
    return json(res, 429, { error: "Too many requests" });
  }

  const from = clean(url.searchParams.get("from"), 10);
  const to = clean(url.searchParams.get("to"), 10);
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from) {
    return json(res, 400, { error: "Invalid date range" });
  }
  if (to > addDays(from, MAX_AVAILABILITY_DAYS)) {
    return json(res, 400, { error: "Date range too wide" });
  }

  try {
    const busyDates = await listBusyDates({ from, to });
    // Short cache: the calendar rarely changes minute to minute, and this keeps
    // month-flipping in the date picker cheap.
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return json(res, 200, { busyDates });
  } catch (error) {
    console.error("Availability error:", error);
    // Fail OPEN for display only: showing every day as bookable is fine because
    // every booking is still team-approved before it's confirmed. We just can't
    // grey out taken days this once.
    return json(res, 200, { busyDates: [], unverified: true });
  }
}

// ── POST: create a pending booking ──────────────────────────────────────────
async function handleSubmit(req, res) {
  const body = await readJsonBody(req);

  // Honeypot: real users never fill this hidden field; naive bots do. Answer 200
  // so the bot can't tell it was caught.
  if (clean(body.website)) {
    return json(res, 200, { ok: true, received: true });
  }

  if (isRateLimited("booking-submit", getClientIp(req), { max: 5 })) {
    return json(res, 429, {
      error: "You've sent a few requests already. Please text us at 415-991-9374.",
    });
  }

  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone, 40);
  const city = clean(body.city, 120);
  const address = clean(body.address);
  const date = clean(body.date, 10);
  const startTime = clean(body.startTime, 5);
  const eventType = clean(body.eventType, 60);
  const guestBand = clean(body.guestBand, 20);
  const notes = clean(body.notes, MAX_NOTES_LENGTH);
  const flexibleTime = body.flexibleTime === true;
  const hours = Number(body.hours);
  // Never bill for a second artist that isn't available, whatever the browser
  // sends. Fails closed if the setting can't be read.
  const secondArtist =
    body.secondArtist === true && (await isSecondArtistAvailable().catch(() => false));
  // Which surface this came from, for the calendar note. Whitelisted so the
  // body can't write arbitrary text into the event description.
  const source = body.source === "chat" ? "chat" : "form";

  // Prep context for the artist. All optional, and every value is trimmed and
  // length-capped before it reaches the calendar event or the notification.
  const d = body.details && typeof body.details === "object" ? body.details : {};
  const GUEST_MIX = { kids: "Kids", adults: "Adults", both: "Kids and adults" };
  const details = {
    honoree: clean(d.honoree, 80),
    companyName: clean(d.companyName, 120),
    occasion: clean(d.occasion, 120),
    guestMix: GUEST_MIX[String(d.guestMix || "").toLowerCase()] || "",
    specialRequests: clean(d.specialRequests, MAX_NOTES_LENGTH),
    customRequest: clean(d.customRequest, MAX_NOTES_LENGTH),
    secondArtistRequested: clean(d.secondArtistRequested, MAX_NOTES_LENGTH),
    paperworkRequest: clean(d.paperworkRequest, MAX_NOTES_LENGTH),
  };

  const problems = [];
  if (name.length < 2 || !/\p{L}/u.test(name)) problems.push("a name");
  if (!isEmail(email)) problems.push("a valid email");
  if (phoneDigits(phone).length < 10) problems.push("a valid phone number");
  if (!ISO_DATE.test(date)) problems.push("an event date");
  if (!HHMM.test(startTime)) problems.push("a start time");
  if (!eventType) problems.push("an event type");
  if (!GUEST_BANDS[guestBand]) problems.push("a guest count");
  if (!city) problems.push("a city");
  if (!Number.isInteger(hours) || hours < 1 || hours > 6) problems.push("a package length");

  if (problems.length) {
    return json(res, 400, {
      error: `We still need ${problems.join(", ")} to send this over.`,
    });
  }

  const today = todayPacific();
  if (date < today) {
    return json(res, 400, { error: "That date has already passed. Please pick an upcoming date." });
  }
  if (date > addDays(today, 365)) {
    return json(res, 400, {
      error: "That's more than a year out. Text us at 415-991-9374 and we'll plan it with you.",
    });
  }

  // Recompute the price server-side. The browser sends a total for display only;
  // this is the number that goes on the booking.
  const quote = computeQuote({ city, hours, secondArtist });
  if (!quote.inServiceArea) {
    return json(res, 400, {
      outOfArea: true,
      error: "We only cover Marin County, San Francisco and Santa Rosa right now.",
    });
  }

  const endTime = endTimeFor(startTime, hours);
  if (!endTime) {
    return json(res, 400, { error: "That start time doesn't look right." });
  }

  // Don't create a second event for someone who already has one that day.
  try {
    const existing = await findDuplicateBooking({ phone, email, date });
    if (existing) {
      return json(res, 200, {
        ok: true,
        duplicate: true,
        message:
          "Looks like we already have a request from you for that date. Our team is on it and will confirm shortly.",
      });
    }
  } catch (error) {
    // A failed dedupe check shouldn't block a real booking — the team reviews
    // every one of these anyway.
    console.error("Duplicate check error:", error);
  }

  // Fold the derived prep note in here too, so the owner's notification email
  // shows it rather than only the calendar event.
  const prepNote = artistPrepNote({
    startTime,
    endTime,
    guestCount: GUEST_BANDS[guestBand],
  });
  if (prepNote) {
    details.specialRequests = [details.specialRequests, prepNote].filter(Boolean).join(" · ");
  }

  const bookingInput = {
    clientName: name,
    clientEmail: email,
    clientPhone: phone,
    date,
    startTime,
    endTime,
    eventType,
    guestCount: GUEST_BANDS[guestBand],
    // The exact street address is optional at request time, so fall back to the
    // city. The team confirms the address when they approve.
    location: address || city,
    quote: `$${quote.total}`,
    notes: [
      notes,
      flexibleTime ? "Client is flexible on the start time." : "",
      address ? "" : "Street address not given yet, confirm with client.",
    ]
      .filter(Boolean)
      .join(" "),
    pending: true,
    source,
    details,
  };

  let bookingResult;
  try {
    bookingResult = await createBooking(bookingInput);
  } catch (error) {
    if (error?.code === "OVERLAP") {
      return json(res, 409, {
        error:
          "That exact time overlaps another booking we already have that day. Please pick a different time, or text us at 415-991-9374 and we'll help find one.",
      });
    }
    console.error("Booking error:", error);
    return json(res, 500, {
      error:
        "Something went wrong sending your request. Please text us at 415-991-9374 and we'll sort it out.",
    });
  }

  // Await the side effects so they finish before this function is frozen — the
  // same reason api/chat.js awaits them. Failures are logged, never fatal: the
  // booking itself is already on the calendar.
  await Promise.allSettled([
    sendBookingNotification(bookingInput, bookingResult).catch((err) =>
      console.error("Notification error:", err)
    ),
    addBookingToSheet(bookingInput, bookingResult).catch((err) =>
      console.error("Sheet error:", err)
    ),
    upsertClient(
      {
        name,
        phone,
        email,
        source: "booking",
        organization: details.companyName,
        lastEventDate: date,
        lastEventType: eventType,
        lastLocation: address || city,
      },
      { incrementBookings: true }
    ).catch((err) => console.error("Client upsert error:", err)),
    // Archive the chat that produced this booking. Only sent by the in-chat
    // form (the transcript lives in the visitor's browser), so it's simply
    // absent for any other path — addConversation no-ops on an empty one.
    addConversation({
      outcome: "booking",
      name,
      phone,
      email,
      summary: `${eventType} · ${date} · $${quote.total}`,
      messages: Array.isArray(body.transcript) ? body.transcript : [],
    }).catch((err) => console.error("Conversation log error:", err)),
    sendEmail({
      to: email,
      subject: "We got your face painting request 🎨",
      html: clientRequestReceivedHtml({
        client: name,
        date,
        time: `${startTime} - ${endTime}`,
        location: address || city,
        eventType,
        guests: GUEST_BANDS[guestBand],
        quote,
        secondArtist,
        hours,
        statusUrl: statusUrlFor(bookingResult.eventId),
      }),
    }).catch((err) => console.error("Client email error:", err)),
  ]);

  return json(res, 200, {
    ok: true,
    quote: { total: quote.total, travelFee: quote.travelFee, area: quote.area },
  });
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.searchParams.get("action") === "availability") {
    return handleAvailability(req, res, url);
  }
  if (req.method === "POST") {
    return handleSubmit(req, res);
  }
  return json(res, 405, { error: "Method not allowed" });
}
