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
