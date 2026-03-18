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

const HEADERS = [
  "Status",
  "Date",
  "Client",
  "Phone",
  "Quote",
  "Time",
  "Event Type",
  "Guests",
  "Location",
  "Email",
  "Notes",
  "Booked On",
];

/**
 * Ensures the header row exists in the spreadsheet.
 * Only writes headers if row 1 is empty.
 */
async function ensureHeaders(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A1:L1",
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:L1",
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADERS],
      },
    });
  }
}

/**
 * Adds a booking row to the Google Sheet.
 * Called after every successful booking (confirmed or pending).
 */
export async function addBookingToSheet(bookingInput, bookingResult) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn("GOOGLE_SHEET_ID not set — skipping sheet update.");
    return;
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  await ensureHeaders(sheets, sheetId);

  const now = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const status = bookingResult.pending ? "PENDING" : "CONFIRMED";

  const row = [
    status,
    bookingInput.date,
    bookingInput.clientName,
    bookingInput.clientPhone,
    bookingInput.quote,
    `${bookingInput.startTime} - ${bookingInput.endTime}`,
    bookingInput.eventType,
    bookingInput.guestCount,
    bookingInput.location,
    bookingInput.clientEmail,
    bookingInput.notes || "",
    now,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:L",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });

  console.log(`Booking added to Google Sheet: ${bookingInput.clientName}`);
}
