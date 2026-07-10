import { google } from 'googleapis';

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

/**
 * Checks Google Calendar for existing events on a given date.
 * Returns whether the date is available or has conflicts.
 */
export async function checkAvailability({ date }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = `${date}T00:00:00-08:00`;
  const timeMax = `${date}T23:59:59-08:00`;

  const result = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = result.data.items || [];
  const hasConflict = events.length > 0;

  return {
    available: !hasConflict,
    date,
    existingEvents: events.map(e => ({
      summary: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
    })),
  };
}

// Format an ISO datetime (or all-day date) into Pacific-time YYYY-MM-DD.
function toPacificDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

// Format an ISO datetime into Pacific-time HH:MM (24h). Empty for all-day.
function toPacificTime(dateTime) {
  if (!dateTime) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateTime));
}

// Pulls a "Label: value" line out of the event description Sky writes.
function descField(description, label) {
  const m = (description || '').match(new RegExp(`^${label}:\\s*(.*)$`, 'mi'));
  return m ? m[1].trim() : '';
}

/**
 * Turns a Calendar event into a normalized booking object, or null if the
 * event isn't a face painting booking. Recognizes Sky-created events by the
 * "Face Painting - Name (Type)" summary or the "Booked by Sky" footer.
 */
function parseEventToBooking(e) {
  const summary = e.summary || '';
  const description = e.description || '';
  const isBooking =
    /face painting/i.test(summary) || /booked by sky/i.test(description);
  if (!isBooking) return null;

  const start = e.start?.dateTime || e.start?.date;
  const end = e.end?.dateTime || e.end?.date;
  if (!start) return null;

  const isPending = /^\[pending\]/i.test(summary) || e.colorId === '6';
  const summaryMatch = summary.match(/face painting - (.+?)\s*\((.+?)\)/i);
  const startTime = toPacificTime(e.start?.dateTime);
  const endTime = toPacificTime(e.end?.dateTime);

  return {
    eventId: e.id,
    status: isPending ? 'PENDING' : 'CONFIRMED',
    date: toPacificDate(start),
    time: startTime && endTime ? `${startTime} - ${endTime}` : startTime,
    client: descField(description, 'Client') || summaryMatch?.[1] || '',
    phone: descField(description, 'Phone'),
    email: descField(description, 'Email'),
    eventType: descField(description, 'Event Type') || summaryMatch?.[2] || '',
    guests: descField(description, 'Guests'),
    location: descField(description, 'Location') || e.location || '',
    quote: descField(description, 'Quote'),
    notes: descField(description, 'Notes'),
  };
}

/**
 * Lists all face painting bookings on the calendar from 30 days ago through
 * 12 months out, as normalized booking objects. Used by the sheet sync so the
 * tracker mirrors whatever currently exists on the calendar.
 */
export async function listCalendarBookings() {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const now = Date.now();
  const timeMin = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();

  const result = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  return (result.data.items || [])
    .map(parseEventToBooking)
    .filter(Boolean);
}

/**
 * Confirms a previously-pending booking: strips the [PENDING] marker, turns the
 * event green, adds the client as an attendee, and sends them the invite. Used
 * by the one-click approve link in the team notification email.
 */
export async function confirmBooking(eventId) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });

  const clientEmail = descField(event.description, 'Email');
  const clientName = descField(event.description, 'Client');

  const summary = (event.summary || '').replace(/^\[pending\]\s*/i, '').trim();
  const description = (event.description || '')
    .split('\n')
    .filter((line) => !/^⚠️/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const patch = {
    summary,
    description,
    colorId: '10', // green = confirmed
  };
  if (clientEmail) {
    patch.attendees = [{ email: clientEmail, displayName: clientName || undefined }];
  }

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    resource: patch,
    sendUpdates: clientEmail ? 'all' : 'none',
  });

  return {
    eventId,
    clientEmail,
    clientName,
    summary,
    start: updated.start?.dateTime || updated.start?.date || '',
  };
}

/**
 * Declines a pending booking: deletes the calendar event. No invite was ever
 * sent for a pending booking, so no cancellation notice goes out. Used by the
 * one-click Decline link in the team notification email.
 */
export async function declineBooking(eventId) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  let clientName = '';
  try {
    const { data: event } = await calendar.events.get({ calendarId, eventId });
    clientName = descField(event.description, 'Client');
  } catch {
    // event may already be gone; deleting below is a no-op / 404
  }

  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' });
  return { eventId, clientName };
}

/**
 * Creates a Google Calendar event for a face painting booking.
 * If pending=true, creates a [PENDING] event with orange color and no invite.
 */
export async function createBooking(bookingData) {
  const {
    clientName,
    clientEmail,
    clientPhone,
    date,
    startTime,
    endTime,
    eventType,
    guestCount,
    location,
    quote,
    notes,
    pending,
  } = bookingData;

  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const startDateTime = `${date}T${startTime}:00`;
  const endDateTime = `${date}T${endTime}:00`;

  const isPending = pending === true;

  const event = {
    summary: isPending
      ? `[PENDING] Face Painting - ${clientName} (${eventType})`
      : `Face Painting - ${clientName} (${eventType})`,
    description: [
      isPending ? '⚠️ AWAITING CONFIRMATION - Artist availability needs to be verified' : '',
      isPending ? '⚠️ Client has NOT been sent a calendar invite yet' : '',
      isPending ? '' : '',
      `Client: ${clientName}`,
      `Email: ${clientEmail}`,
      `Phone: ${clientPhone}`,
      `Event Type: ${eventType}`,
      `Guests: ${guestCount}`,
      `Location: ${location}`,
      `Quote: ${quote}`,
      notes ? `Notes: ${notes}` : '',
      '',
      "Booked by Sky, Face Painting California's assistant",
    ]
      .filter(Boolean)
      .join('\n'),
    location: location,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Los_Angeles',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/Los_Angeles',
    },
    // Google Calendar color IDs: 6 = orange (pending), 10 = green (confirmed)
    colorId: isPending ? '6' : '10',
    // Only add attendee and send invite if NOT pending
    ...(isPending
      ? {}
      : {
          attendees: [{ email: clientEmail, displayName: clientName }],
        }),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'email', minutes: 48 * 60 },
      ],
    },
  };

  const result = await calendar.events.insert({
    calendarId,
    resource: event,
    // Only send updates (calendar invite) if NOT pending
    sendUpdates: isPending ? 'none' : 'all',
  });

  return {
    success: true,
    pending: isPending,
    eventId: result.data.id,
    htmlLink: result.data.htmlLink,
    summary: event.summary,
    start: startDateTime,
    end: endDateTime,
  };
}

// Vercel serverless handler (for direct API calls if needed)
// NOTE: This module intentionally exposes NO public HTTP handler.
// Bookings are created only through the Sky assistant flow in api/chat.js,
// which imports createBooking()/checkAvailability() directly. Exporting a
// default handler here would create an unauthenticated /api/book endpoint that
// anyone could POST to in order to spam the real Google Calendar.
