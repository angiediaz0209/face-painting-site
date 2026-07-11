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
  const priv = e.extendedProperties?.private || {};
  const hasReschedule = !!priv.rescheduleDate;
  const summaryMatch = summary.match(/face painting - (.+?)\s*\((.+?)\)/i);
  const startTime = toPacificTime(e.start?.dateTime);
  const endTime = toPacificTime(e.end?.dateTime);

  // For manual/legacy calendar entries with no structured "Client:" field, fall
  // back to the event title (minus the "[PENDING]" / "Face Painting" prefix) so
  // the card shows something meaningful instead of a blank name.
  const titleName = summary
    .replace(/^\[pending\]\s*/i, '')
    .replace(/^face\s*painting\s*[-:]?\s*/i, '')
    .trim();

  return {
    eventId: e.id,
    status: hasReschedule
      ? 'RESCHEDULE REQUESTED'
      : isPending
        ? 'PENDING'
        : 'CONFIRMED',
    proposedDate: priv.rescheduleDate || '',
    proposedTime: priv.rescheduleTime || '',
    date: toPacificDate(start),
    time: startTime && endTime ? `${startTime} - ${endTime}` : startTime,
    client: descField(description, 'Client') || summaryMatch?.[1] || titleName || '',
    phone: descField(description, 'Phone'),
    email: descField(description, 'Email'),
    eventType: descField(description, 'Event Type') || summaryMatch?.[2] || '',
    guests: descField(description, 'Guests'),
    location: descField(description, 'Location') || e.location || '',
    quote: descField(description, 'Quote'),
    notes: descField(description, 'Notes'),
    htmlLink: e.htmlLink || '',
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
 * Fetches a single Calendar event and returns it as a normalized booking object
 * (or null if it isn't a face painting booking / doesn't exist). Used by the
 * client status page.
 */
export async function getBooking(eventId) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  return parseEventToBooking(event);
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

  const parsed = parseEventToBooking(event) || {};
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

  // Keep the client as a guest for calendar visibility, but do NOT send the
  // native Google invite — the client gets a branded confirmation email instead.
  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    resource: patch,
    sendUpdates: 'none',
  });

  return {
    eventId,
    clientEmail,
    clientName,
    summary,
    start: updated.start?.dateTime || updated.start?.date || '',
    // full booking fields for the client confirmation email
    date: parsed.date || '',
    time: parsed.time || '',
    location: parsed.location || '',
    quote: parsed.quote || '',
    eventType: parsed.eventType || '',
    guests: parsed.guests || '',
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
  let clientEmail = '';
  let date = '';
  try {
    const { data: event } = await calendar.events.get({ calendarId, eventId });
    const parsed = parseEventToBooking(event) || {};
    clientName = parsed.client || descField(event.description, 'Client');
    clientEmail = parsed.email || descField(event.description, 'Email');
    date = parsed.date || '';
  } catch {
    // event may already be gone; deleting below is a no-op / 404
  }

  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' });
  return { eventId, clientName, clientEmail, date };
}

// "14:00" -> 840 ; 900 -> "15:00". Used to shift a booking to a new day while
// preserving its duration.
function toMin(hhmm) {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMin(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Deletes the reschedule-request keys from an extendedProperties.private bag.
// Sending null tells the Calendar API to remove the property server-side.
function clearRescheduleKeys(priv) {
  return {
    ...priv,
    rescheduleDate: null,
    rescheduleTime: null,
    rescheduleRequestedAt: null,
  };
}

/**
 * Records a client's reschedule REQUEST on the event without moving it: stores
 * the proposed date/time in private extended properties (so it survives the
 * sheet sync) and flags the event yellow in the owner's calendar. The event
 * only actually moves once the owner approves (see applyReschedule).
 */
export async function requestReschedule(eventId, { date, time }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const priv = event.extendedProperties?.private || {};

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: 'none',
    resource: {
      colorId: '5', // banana/yellow = reschedule requested (visible flag)
      extendedProperties: {
        private: {
          ...priv,
          rescheduleDate: date,
          rescheduleTime: time || '',
          rescheduleRequestedAt: new Date().toISOString(),
        },
      },
    },
  });

  return parseEventToBooking(updated);
}

/**
 * Applies a pending reschedule request: moves the event to the proposed date
 * (preserving its original duration), clears the request, turns it green, and
 * re-attaches the client. Returns booking fields for the client confirmation
 * email. Used by the one-click "Approve new date" link in the owner email.
 */
export async function applyReschedule(eventId) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const priv = event.extendedProperties?.private || {};
  const newDate = priv.rescheduleDate;
  if (!newDate) return null; // nothing to apply

  const startHHMM = toPacificTime(event.start?.dateTime) || '00:00';
  const endHHMM = toPacificTime(event.end?.dateTime) || startHHMM;
  const durMin = Math.max(toMin(endHHMM) - toMin(startHHMM), 60);
  const time = priv.rescheduleTime || startHHMM;
  const newEnd = fromMin(toMin(time) + durMin);

  const clientEmail = descField(event.description, 'Email');
  const clientName = descField(event.description, 'Client');
  const summary = (event.summary || '').replace(/^\[pending\]\s*/i, '').trim();

  const patch = {
    summary,
    colorId: '10', // green = confirmed
    start: { dateTime: `${newDate}T${time}:00`, timeZone: 'America/Los_Angeles' },
    end: { dateTime: `${newDate}T${newEnd}:00`, timeZone: 'America/Los_Angeles' },
    extendedProperties: { private: clearRescheduleKeys(priv) },
  };
  if (clientEmail) {
    patch.attendees = [{ email: clientEmail, displayName: clientName || undefined }];
  }

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    resource: patch,
    sendUpdates: 'none',
  });
  const parsed = parseEventToBooking(updated) || {};

  return {
    eventId,
    clientEmail,
    clientName,
    date: parsed.date || '',
    time: parsed.time || '',
    location: parsed.location || '',
    quote: parsed.quote || '',
    eventType: parsed.eventType || '',
    guests: parsed.guests || '',
  };
}

/**
 * Dismisses a reschedule request without moving the event (owner keeps the
 * current date). Clears the request flag and restores the event's color.
 * Returns the (unchanged) booking plus the date the client had proposed.
 */
export async function clearReschedule(eventId) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const priv = event.extendedProperties?.private || {};
  const wasPending = /^\[pending\]/i.test(event.summary || '');

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: 'none',
    resource: {
      colorId: wasPending ? '6' : '10',
      extendedProperties: { private: clearRescheduleKeys(priv) },
    },
  });
  const parsed = parseEventToBooking(updated) || {};

  return {
    eventId,
    clientEmail: descField(event.description, 'Email'),
    clientName: descField(event.description, 'Client'),
    date: parsed.date || '',
    time: parsed.time || '',
    proposedDate: priv.rescheduleDate || '',
  };
}

/**
 * Moves a booking to a new date/time directly (owner manual reschedule from the
 * dashboard). Preserves the original duration and PENDING/CONFIRMED state, and
 * clears any open reschedule request. Returns the updated normalized booking.
 */
export async function moveBooking(eventId, { date, time }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const priv = event.extendedProperties?.private || {};
  const wasPending = /^\[pending\]/i.test(event.summary || '') || event.colorId === '6';

  const startHHMM = toPacificTime(event.start?.dateTime) || '00:00';
  const endHHMM = toPacificTime(event.end?.dateTime) || startHHMM;
  const durMin = Math.max(toMin(endHHMM) - toMin(startHHMM), 60);
  const newTime = time || startHHMM;
  const newEnd = fromMin(toMin(newTime) + durMin);

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: 'none',
    resource: {
      colorId: wasPending ? '6' : '10',
      start: { dateTime: `${date}T${newTime}:00`, timeZone: 'America/Los_Angeles' },
      end: { dateTime: `${date}T${newEnd}:00`, timeZone: 'America/Los_Angeles' },
      extendedProperties: { private: clearRescheduleKeys(priv) },
    },
  });

  return parseEventToBooking(updated);
}

// Builds the structured "Client: … / Email: …" description block that
// parseEventToBooking reads back out. `footer` is the attribution line.
function buildBookingDescription(d, footer) {
  return [
    d.clientName ? `Client: ${d.clientName}` : '',
    d.clientEmail ? `Email: ${d.clientEmail}` : '',
    d.clientPhone ? `Phone: ${d.clientPhone}` : '',
    d.eventType ? `Event Type: ${d.eventType}` : '',
    d.guestCount ? `Guests: ${d.guestCount}` : '',
    d.location ? `Location: ${d.location}` : '',
    d.quote ? `Quote: ${d.quote}` : '',
    d.notes ? `Notes: ${d.notes}` : '',
    '',
    footer,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Creates a booking straight from the owner dashboard: a CONFIRMED (green)
 * calendar event with the full structured description, and NO client invite/email
 * (the owner is logging an event they already know about). Returns the normalized
 * booking. Defaults the end time to start + 2h when not given.
 */
export async function createOwnerBooking(d) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const endTime = d.endTime || fromMin(toMin(d.startTime) + 120);

  const event = {
    summary: `Face Painting - ${d.clientName}${d.eventType ? ` (${d.eventType})` : ''}`,
    description: buildBookingDescription(d, 'Added by the team'),
    location: d.location || '',
    start: { dateTime: `${d.date}T${d.startTime}:00`, timeZone: 'America/Los_Angeles' },
    end: { dateTime: `${d.date}T${endTime}:00`, timeZone: 'America/Los_Angeles' },
    colorId: '10', // green = confirmed
  };

  const { data: created } = await calendar.events.insert({
    calendarId,
    resource: event,
    sendUpdates: 'none',
  });
  return parseEventToBooking(created);
}

/**
 * Updates an existing booking's details in place from the owner dashboard edit
 * form. Preserves PENDING/CONFIRMED state and any reschedule request; never
 * sends a client invite. Returns the normalized booking.
 */
export async function updateBooking(eventId, d) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const wasPending = /^\[pending\]/i.test(event.summary || '') || event.colorId === '6';
  const footer = /booked by sky/i.test(event.description || '')
    ? "Booked by Sky, Face Painting California's assistant"
    : 'Added by the team';

  const body = buildBookingDescription(d, footer);
  const description = wasPending
    ? [
        '⚠️ AWAITING CONFIRMATION - Artist availability needs to be verified',
        '⚠️ Client has NOT been sent a calendar invite yet',
        '',
        body,
      ].join('\n')
    : body;

  const patch = {
    summary: `${wasPending ? '[PENDING] ' : ''}Face Painting - ${d.clientName}${d.eventType ? ` (${d.eventType})` : ''}`,
    description,
    location: d.location || '',
  };
  if (d.date && d.startTime) {
    const endTime = d.endTime || fromMin(toMin(d.startTime) + 120);
    patch.start = { dateTime: `${d.date}T${d.startTime}:00`, timeZone: 'America/Los_Angeles' };
    patch.end = { dateTime: `${d.date}T${endTime}:00`, timeZone: 'America/Los_Angeles' };
  }

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    resource: patch,
    sendUpdates: 'none',
  });
  return parseEventToBooking(updated);
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
