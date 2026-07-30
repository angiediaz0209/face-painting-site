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

// Column layout (A..O). Calendar is the source of truth for the
// scheduling columns; "Paid?" and "Artist" are yours to edit by hand and
// are preserved across every sync. "Event ID" keys each row so bookings
// update in place instead of duplicating.
const HEADERS = [
  "Status", // A  (0)  CONFIRMED / PENDING / CANCELLED  <- from Calendar
  "Date", // B  (1)  <- from Calendar
  "Time", // C  (2)  <- from Calendar
  "Client", // D  (3)  <- from Calendar
  "Phone", // E  (4)  <- from Calendar
  "Email", // F  (5)  <- from Calendar
  "Event Type", // G  (6)  <- from Calendar
  "Guests", // H  (7)  <- from Calendar
  "Location", // I  (8)  <- from Calendar
  "Quote", // J  (9)  <- from Calendar
  "Paid?", // K  (10) <- YOURS, preserved
  "Artist", // L  (11) <- YOURS, preserved
  "Notes", // M  (12) <- from Calendar
  "Booked On", // N  (13) original timestamp, preserved
  "Event ID", // O  (14) key, do not edit
];

const RANGE = "Sheet1!A:O";
const COL = { STATUS: 0, PAID: 10, ARTIST: 11, BOOKED_ON: 13, EVENT_ID: 14 };

function getSheetsClient() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return null;
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, sheetId };
}

function nowStamp() {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ensures row 1 holds the current headers; rewrites them if missing or outdated. */
async function ensureHeaders(sheets, sheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A1:O1",
  });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Sheet1!A1:O1",
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * Builds a 15-cell row from a normalized booking object. When `existing`
 * (the current row cells) is provided, the manual columns (Paid?, Artist)
 * and the original "Booked On" timestamp are carried over untouched.
 */
function bookingToRow(b, existing) {
  return [
    b.status, // A
    b.date, // B
    b.time, // C
    b.client, // D
    b.phone, // E
    b.email, // F
    b.eventType, // G
    b.guests, // H
    b.location, // I
    b.quote, // J
    existing ? existing[COL.PAID] || "" : "", // K  preserved
    existing ? existing[COL.ARTIST] || "" : "", // L  preserved
    b.notes, // M
    existing ? existing[COL.BOOKED_ON] || nowStamp() : nowStamp(), // N preserved
    b.eventId, // O
  ];
}

/**
 * Upserts bookings into the sheet keyed by Event ID (one Calendar read + one
 * batched write). Existing rows are updated in place (preserving your manual
 * columns); new bookings are appended.
 *
 * When `markCancellations` is true, any sheet row whose Event ID is no longer
 * present in `bookings` is flipped to CANCELLED — this is how deletions in
 * Calendar propagate to the sheet. Pass false for a single fresh booking so it
 * doesn't cancel everything else.
 */
export async function syncBookingsToSheet(bookings, { markCancellations = false } = {}) {
  const client = getSheetsClient();
  if (!client) {
    console.warn("GOOGLE_SHEET_ID not set — skipping sheet update.");
    return { updated: 0, added: 0, cancelled: 0 };
  }
  const { sheets, sheetId } = client;

  await ensureHeaders(sheets, sheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: RANGE,
  });
  const allRows = res.data.values || [];
  const dataRows = allRows.slice(1); // drop header

  // Map existing Event ID -> { rowNumber (1-based in sheet), cells }
  const byEventId = new Map();
  dataRows.forEach((cells, i) => {
    const id = cells[COL.EVENT_ID];
    if (id) byEventId.set(id, { rowNumber: i + 2, cells });
  });

  const updates = []; // { range, values }
  const appends = [];

  for (const b of bookings) {
    const existing = byEventId.get(b.eventId);
    const row = bookingToRow(b, existing?.cells);
    if (existing) {
      updates.push({
        range: `Sheet1!A${existing.rowNumber}:O${existing.rowNumber}`,
        values: [row],
      });
    } else {
      appends.push(row);
    }
  }

  let cancelled = 0;
  if (markCancellations) {
    const liveIds = new Set(bookings.map((b) => b.eventId));
    dataRows.forEach((cells, i) => {
      const id = cells[COL.EVENT_ID];
      const status = (cells[COL.STATUS] || "").toUpperCase();
      if (id && !liveIds.has(id) && status !== "CANCELLED") {
        updates.push({
          range: `Sheet1!A${i + 2}`,
          values: [["CANCELLED"]],
        });
        cancelled++;
      }
    });
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  return { updated: updates.length - cancelled, added: appends.length, cancelled };
}

/**
 * Sets the Status cell for a single booking (found by Event ID). Used by the
 * one-click approve flow to flip a row to CONFIRMED right away.
 */
export async function setBookingStatus(eventId, status) {
  const client = getSheetsClient();
  if (!client) return;
  const { sheets, sheetId } = client;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: RANGE,
  });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COL.EVENT_ID] === eventId) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Sheet1!A${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[status]] },
      });
      return;
    }
  }
}

/**
 * Adds (or updates) a single booking right after Sky creates it.
 * Never cancels other rows.
 */
export async function addBookingToSheet(bookingInput, bookingResult) {
  const booking = {
    eventId: bookingResult.eventId,
    status: bookingResult.pending ? "PENDING" : "CONFIRMED",
    date: bookingInput.date,
    time: `${bookingInput.startTime} - ${bookingInput.endTime}`,
    client: bookingInput.clientName,
    phone: bookingInput.clientPhone,
    email: bookingInput.clientEmail,
    eventType: bookingInput.eventType,
    guests: bookingInput.guestCount,
    location: bookingInput.location,
    quote: bookingInput.quote,
    notes: bookingInput.notes || "",
  };
  const result = await syncBookingsToSheet([booking], { markCancellations: false });
  console.log(`Booking synced to Google Sheet: ${bookingInput.clientName}`);
  return result;
}

// ── Clients tab (CRM) ─────────────────────────────────────────────────────────
// A second tab in the same spreadsheet, keyed by a normalized phone/email so a
// client is a single row across every source (a booking, a manually-added past
// client, or a chat lead). Bookings feed it automatically; the owner also edits
// it by hand. Keep column order stable — the follow-ups + recognition logic in
// clients.js reads by index.
const CLIENT_HEADERS = [
  "Key", // 0  normalized phone digits or lowercased email (dedupe key)
  "Name", // 1
  "Phone", // 2
  "Email", // 3
  "Source", // 4  booking | manual | lead
  "Last Event Date", // 5  YYYY-MM-DD
  "Last Event Type", // 6
  "Last Location", // 7
  "Birthday", // 8  MM-DD (optional, overrides the event-date anniversary)
  "Total Bookings", // 9
  "Opt-out", // 10 marketing opt-out (TRUE / blank)
  "Last Promo Sent", // 11 YYYY-MM-DD of the last discount email
  "First Seen", // 12 timestamp, preserved
  "Notes", // 13
  "Organization", // 14 school or company name, so repeat orgs are recognised
                  //    even when the contact person changes
];
const CLIENT_RANGE = "Clients!A:O";
const SOURCE_RANK = { lead: 1, manual: 2, booking: 3 };

function isTruthyCell(v) {
  return /^(true|yes|1|y)$/i.test((v || "").trim());
}

function rowToClient(cells, rowNumber) {
  const g = (i) => (cells[i] || "").trim();
  return {
    rowNumber,
    key: g(0),
    name: g(1),
    phone: g(2),
    email: g(3),
    source: g(4),
    lastEventDate: g(5),
    lastEventType: g(6),
    lastLocation: g(7),
    birthday: g(8),
    totalBookings: g(9),
    optOut: isTruthyCell(cells[10]),
    lastPromoSent: g(11),
    firstSeen: g(12),
    notes: g(13),
    organization: g(14),
  };
}

function clientToRow(c) {
  return [
    c.key,
    c.name,
    c.phone,
    c.email,
    c.source,
    c.lastEventDate,
    c.lastEventType,
    c.lastLocation,
    c.birthday,
    c.totalBookings,
    c.optOut ? "TRUE" : "",
    c.lastPromoSent,
    c.firstSeen,
    c.notes,
    c.organization,
  ].map((v) => (v == null ? "" : String(v)));
}

// Field-level merge: a non-empty incoming value wins, except First Seen (kept),
// source (never downgraded — a real client stays a client, not a lead), opt-out
// (only changed when explicitly set), and Total Bookings (incremented on a new
// booking).
function mergeClient(existing, incoming, incrementBookings) {
  const e = existing || {};
  const pick = (a, b) => (a != null && String(a).trim() !== "" ? String(a).trim() : b || "");

  let source = pick(incoming.source, e.source);
  if (e.source && incoming.source && (SOURCE_RANK[incoming.source] || 0) < (SOURCE_RANK[e.source] || 0)) {
    source = e.source;
  }

  let totalBookings = pick(incoming.totalBookings, e.totalBookings);
  if (incrementBookings) {
    totalBookings = String((parseInt(e.totalBookings, 10) || 0) + 1);
  }

  return {
    key: incoming.key || e.key,
    name: pick(incoming.name, e.name),
    phone: pick(incoming.phone, e.phone),
    email: pick(incoming.email, e.email),
    source,
    lastEventDate: pick(incoming.lastEventDate, e.lastEventDate),
    lastEventType: pick(incoming.lastEventType, e.lastEventType),
    lastLocation: pick(incoming.lastLocation, e.lastLocation),
    birthday: pick(incoming.birthday, e.birthday),
    totalBookings,
    optOut: incoming.optOut != null ? !!incoming.optOut : !!e.optOut,
    lastPromoSent: pick(incoming.lastPromoSent, e.lastPromoSent),
    firstSeen: e.firstSeen || nowStamp(),
    notes: pick(incoming.notes, e.notes),
  };
}

/** Creates the "Clients" tab if missing and makes sure row 1 holds the headers. */
async function ensureClientsSheet(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === "Clients");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Clients" } } }] },
    });
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Clients!A1:O1" });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== CLIENT_HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Clients!A1:O1",
      valueInputOption: "RAW",
      requestBody: { values: [CLIENT_HEADERS] },
    });
  }
}

/** Returns every client row (excluding the header) as normalized objects. */
export async function getClients() {
  const client = getSheetsClient();
  if (!client) return [];
  const { sheets, sheetId } = client;
  await ensureClientsSheet(sheets, sheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: CLIENT_RANGE });
  const rows = res.data.values || [];
  return rows
    .slice(1)
    .map((cells, i) => rowToClient(cells, i + 2))
    .filter((c) => c.key);
}

/**
 * Upserts a client by Key: merges into the existing row if one is found, else
 * appends a new one. Pass `incrementBookings: true` from the booking flow to bump
 * the Total Bookings counter. Returns the merged client (or null if no sheet).
 */
export async function upsertClient(record, { incrementBookings = false } = {}) {
  if (!record?.key) return null;
  const client = getSheetsClient();
  if (!client) return null;
  const { sheets, sheetId } = client;
  await ensureClientsSheet(sheets, sheetId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: CLIENT_RANGE });
  const rows = res.data.values || [];
  let existing = null;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || "").trim() === record.key) {
      existing = rowToClient(rows[i], i + 1);
      break;
    }
  }

  const merged = mergeClient(existing, record, incrementBookings);
  const row = clientToRow(merged);
  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Clients!A${existing.rowNumber}:N${existing.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: CLIENT_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }
  return merged;
}

// ── Booking history (read the tracker) ────────────────────────────────────────
// The Sheet1 tracker keeps every booking that ever synced, including past ones
// beyond the calendar's 30-day read window — so it's the durable archive the
// "Past events" view reads from.
export async function getBookingsFromSheet() {
  const client = getSheetsClient();
  if (!client) return [];
  const { sheets, sheetId } = client;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE });
  const rows = res.data.values || [];
  return rows
    .slice(1)
    .map((c) => ({
      status: (c[0] || "").toUpperCase(),
      date: (c[1] || "").trim(),
      time: (c[2] || "").trim(),
      client: (c[3] || "").trim(),
      phone: (c[4] || "").trim(),
      email: (c[5] || "").trim(),
      eventType: (c[6] || "").trim(),
      guests: (c[7] || "").trim(),
      location: (c[8] || "").trim(),
      quote: (c[9] || "").trim(),
      notes: (c[12] || "").trim(), // M Notes
      eventId: (c[COL.EVENT_ID] || "").trim(),
    }))
    .filter((b) => b.date);
}

// ── Reviews tab ───────────────────────────────────────────────────────────────
// Client-submitted reviews land here as "pending"; the owner approves the ones
// that should appear publicly on the website (served via /api/review?list=1).
const REVIEW_HEADERS = ["ID", "Status", "Submitted", "Name", "Rating", "Event Type", "Text", "Key"];
const REVIEW_RANGE = "Reviews!A:H";

function rowToReview(cells, rowNumber) {
  const g = (i) => (cells[i] || "").trim();
  return {
    rowNumber,
    id: g(0),
    status: g(1).toLowerCase() || "pending",
    submitted: g(2),
    name: g(3),
    rating: Math.min(5, Math.max(1, parseInt(g(4), 10) || 5)),
    eventType: g(5),
    text: g(6),
    key: g(7), // client key (from a one-time link), blank for the generic form
  };
}

async function ensureReviewsSheet(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === "Reviews");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Reviews" } } }] },
    });
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Reviews!A1:H1" });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== REVIEW_HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Reviews!A1:H1",
      valueInputOption: "RAW",
      requestBody: { values: [REVIEW_HEADERS] },
    });
  }
}

export async function getReviews() {
  const client = getSheetsClient();
  if (!client) return [];
  const { sheets, sheetId } = client;
  await ensureReviewsSheet(sheets, sheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: REVIEW_RANGE });
  const rows = res.data.values || [];
  return rows.slice(1).map((c, i) => rowToReview(c, i + 2)).filter((r) => r.id);
}

/** Appends a new client-submitted review as "pending". Returns its id. */
export async function addReview({ name, rating, eventType, text, key }) {
  const client = getSheetsClient();
  if (!client) return null;
  const { sheets, sheetId } = client;
  await ensureReviewsSheet(sheets, sheetId);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = [id, "pending", nowStamp(), name, String(rating), eventType || "", text, key || ""];
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: REVIEW_RANGE,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return id;
}

// ── Settings tab ──────────────────────────────────────────────────────────────
// Owner-controlled switches that change how Sky behaves, without a redeploy.
// Simple key/value rows.
//
// Sky reads these on every chat message, so they're cached in memory per warm
// serverless instance. A toggle therefore takes up to SETTINGS_TTL_MS to take
// effect, which is the right trade for not hitting Sheets on every message.
const SETTINGS_HEADERS = ["Key", "Value"];
const SETTINGS_RANGE = "Settings!A:B";
const SETTINGS_TTL_MS = 60 * 1000;

let settingsCache = { at: 0, values: null };

async function ensureSettingsSheet(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === "Settings");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Settings" } } }] },
    });
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Settings!A1:B1" });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== SETTINGS_HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Settings!A1:B1",
      valueInputOption: "RAW",
      requestBody: { values: [SETTINGS_HEADERS] },
    });
  }
}

/** All settings as a plain object. Cached; pass { fresh: true } to bypass. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache.values && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.values;
  }
  const client = getSheetsClient();
  if (!client) return {};
  const { sheets, sheetId } = client;
  try {
    await ensureSettingsSheet(sheets, sheetId);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: SETTINGS_RANGE });
    const values = {};
    for (const row of (res.data.values || []).slice(1)) {
      const key = (row[0] || "").trim();
      if (key) values[key] = (row[1] || "").trim();
    }
    settingsCache = { at: Date.now(), values };
    return values;
  } catch (error) {
    console.error("Settings read error:", error);
    // Fall back to the last known values rather than silently changing behaviour.
    return settingsCache.values || {};
  }
}

/** Writes one setting and clears the cache so the change is picked up at once. */
export async function setSetting(key, value) {
  const client = getSheetsClient();
  if (!client) return false;
  const { sheets, sheetId } = client;
  await ensureSettingsSheet(sheets, sheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: SETTINGS_RANGE });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r, i) => i > 0 && (r[0] || "").trim() === key);

  if (rowIndex > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Settings!B${rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[String(value)]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: SETTINGS_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[key, String(value)]] },
    });
  }
  settingsCache = { at: 0, values: null };
  return true;
}

// Is a second artist bookable right now? Defaults to FALSE: if the sheet is
// unreachable we must not have Sky selling capacity that may not exist.
export const SECOND_ARTIST_KEY = "second_artist_available";

export async function isSecondArtistAvailable() {
  const settings = await getSettings();
  return settings[SECOND_ARTIST_KEY] === "yes";
}

// ── Conversations tab ─────────────────────────────────────────────────────────
// Sky's chats, kept only when they produced something: a booking or a lead. The
// transcript otherwise lives solely in the visitor's own browser.
//
// These rows are more sensitive than a booking record — they contain children's
// names and ages, addresses, and offhand remarks people didn't think were being
// filed. Keep only what's useful and purge them periodically; there's no reason
// to hold a year-old chat about a party that already happened.
const CONVERSATION_HEADERS = [
  "ID", "Logged", "Outcome", "Name", "Phone", "Email", "Summary", "Transcript",
];
const CONVERSATION_RANGE = "Conversations!A:H";

// A transcript can run long and a Sheets cell caps out at 50k characters, so
// keep a generous but bounded slice.
const MAX_TRANSCRIPT_CHARS = 40000;

function rowToConversation(cells, rowNumber) {
  const g = (i) => (cells[i] || "").trim();
  return {
    rowNumber,
    id: g(0),
    logged: g(1),
    outcome: g(2) || "chat",
    name: g(3),
    phone: g(4),
    email: g(5),
    summary: g(6),
    transcript: g(7),
  };
}

async function ensureConversationsSheet(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === "Conversations");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Conversations" } } }] },
    });
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Conversations!A1:H1" });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== CONVERSATION_HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Conversations!A1:H1",
      valueInputOption: "RAW",
      requestBody: { values: [CONVERSATION_HEADERS] },
    });
  }
}

/** Newest first, so the dashboard shows recent chats at the top. */
export async function getConversations() {
  const client = getSheetsClient();
  if (!client) return [];
  const { sheets, sheetId } = client;
  await ensureConversationsSheet(sheets, sheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: CONVERSATION_RANGE });
  const rows = res.data.values || [];
  return rows
    .slice(1)
    .map((c, i) => rowToConversation(c, i + 2))
    .filter((c) => c.id)
    .reverse();
}

/**
 * Records a finished conversation. `messages` is the chat transcript as
 * [{ role, content }]. Called from the non-blocking side-effect batch, so a
 * Sheets failure can never cost a booking.
 */
export async function addConversation({ outcome, name, phone, email, summary, messages }) {
  const client = getSheetsClient();
  if (!client) return null;
  const { sheets, sheetId } = client;
  await ensureConversationsSheet(sheets, sheetId);

  // Filter on the message content, not the formatted line: "Client: " is eight
  // characters, so a length check would let blank messages through as empty rows.
  const transcript = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m.role, content: String(m.content || "").trim() }))
    .filter((m) => m.content)
    .map((m) => `${m.role === "user" ? "Client" : "Sky"}: ${m.content}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);

  if (!transcript) return null;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = [
    id, nowStamp(), outcome || "chat", name || "", phone || "", email || "",
    summary || "", transcript,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: CONVERSATION_RANGE,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  return id;
}

/** Sets a review's Status by ID ("approved" / "rejected" / "pending"). */
export async function setReviewStatus(id, status) {
  const client = getSheetsClient();
  if (!client) return;
  const { sheets, sheetId } = client;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: REVIEW_RANGE });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || "").trim() === id) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Reviews!B${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[status]] },
      });
      return;
    }
  }
}

// ── Gallery tab ───────────────────────────────────────────────────────────────
// Owner-uploaded website photos. Files live on Vercel Blob; this tab just holds
// the public URL + caption + ordering so the marketing site can render them.
const GALLERY_HEADERS = ["ID", "URL", "Alt", "Added"];
const GALLERY_RANGE = "Gallery!A:D";

async function ensureGallerySheet(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === "Gallery");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: "Gallery" } } }] },
    });
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "Gallery!A1:D1" });
  const current = res.data.values?.[0] || [];
  if (current.join("|") !== GALLERY_HEADERS.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Gallery!A1:D1",
      valueInputOption: "RAW",
      requestBody: { values: [GALLERY_HEADERS] },
    });
  }
}

export async function getGallery() {
  const client = getSheetsClient();
  if (!client) return [];
  const { sheets, sheetId } = client;
  await ensureGallerySheet(sheets, sheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: GALLERY_RANGE });
  const rows = res.data.values || [];
  return rows
    .slice(1)
    .map((c, i) => ({ rowNumber: i + 2, id: (c[0] || "").trim(), url: (c[1] || "").trim(), alt: (c[2] || "").trim(), added: (c[3] || "").trim() }))
    .filter((g) => g.id && g.url);
}

/** Appends an uploaded image (public Blob URL + caption). Returns its id. */
export async function addGalleryImage({ url, alt }) {
  const client = getSheetsClient();
  if (!client) return null;
  const { sheets, sheetId } = client;
  await ensureGallerySheet(sheets, sheetId);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: GALLERY_RANGE,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[id, url, alt || "", nowStamp()]] },
  });
  return id;
}

/** Removes a gallery row by ID (clears the row so ordering stays stable). */
export async function removeGalleryImage(id) {
  const client = getSheetsClient();
  if (!client) return;
  const { sheets, sheetId } = client;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: GALLERY_RANGE });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || "").trim() === id) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Gallery!A${i + 1}:D${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [["", "", "", ""]] },
      });
      return;
    }
  }
}
