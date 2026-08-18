import { google } from 'googleapis';
import { cached } from './cache.js';
import { resolveArea } from '../../shared/pricing.js';

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
 *
 * Called two ways by Sky:
 *  - date only, early in the conversation: `available` is whether the day is
 *    completely empty. A day with an existing event is NOT automatically a
 *    dead end anymore, existingEvents.length > 0 just means Sky should gather
 *    the candidate time and location and call this again with those, to get
 *    a real same-day timing verdict instead of assuming the day is full.
 *  - date + startTime + endTime + location, once known: `available` reflects
 *    the real timing check (assessSameDayTiming) — false only when the times
 *    actually overlap another booking, since 'tight'/'urgent' gaps are still
 *    bookable (as a flagged pending booking), just not a clean yes.
 */
export async function checkAvailability({ date, startTime, endTime, location }) {
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
  const existingEvents = events.map((e) => ({
    summary: e.summary,
    start: e.start.dateTime || e.start.date,
    end: e.end.dateTime || e.end.date,
    location: e.location || '',
  }));

  if (startTime && endTime) {
    const timing = await assessSameDayTiming({ date, startTime, endTime, location });
    return {
      available: timing.status !== 'overlap',
      date,
      existingEvents,
      timing,
    };
  }

  return {
    available: events.length === 0,
    date,
    existingEvents,
    note:
      events.length > 0
        ? 'This day already has another booking, but it may still be bookable. Get the candidate start time, end time, and location, then call check_availability again with those to get a real same-day timing verdict instead of assuming the day is full.'
        : undefined,
  };
}

/**
 * Busy dates in a range, for the booking form's date picker.
 *
 * Returns ONLY an array of YYYY-MM-DD strings. This is called from a public
 * endpoint, so it must never leak event titles, client names, or locations —
 * just which days are taken.
 *
 * A day with any event on it counts as busy, matching how checkAvailability
 * treats conflicts for Sky. Someone who really wants a taken day can still ask
 * by text.
 */
export async function listBusyDates({ from, to }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.list({
    calendarId,
    timeMin: `${from}T00:00:00-08:00`,
    timeMax: `${to}T23:59:59-08:00`,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  const busy = new Set();
  for (const e of result.data.items || []) {
    const startRaw = e.start?.dateTime || e.start?.date;
    if (!startRaw) continue;
    const endRaw = e.end?.dateTime || e.end?.date || startRaw;

    // Walk every day the event covers, so multi-day events block each of them.
    const startDay = toPacificDate(startRaw);
    const endDay = toPacificDate(endRaw);
    let cursor = new Date(`${startDay}T12:00:00`);
    const last = new Date(`${endDay}T12:00:00`);
    // All-day events use an EXCLUSIVE end date, so the last day they actually
    // cover is the day before. Timed events end on the day they end.
    if (e.start?.date && !e.start?.dateTime) last.setDate(last.getDate() - 1);
    let guard = 0;
    while (cursor <= last && guard++ < 400) {
      busy.add(toPacificDate(cursor.toISOString()));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return [...busy].sort();
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
    // Written by createBooking()'s detailLines for corporate/school events, but
    // never read back until the receipt needed to address a company or school
    // by name rather than just the contact's personal name.
    organization: descField(description, 'Company'),
    occasion: descField(description, 'Occasion'),
    // Client's e-signature on the booking agreement, written by signContract().
    // Lives in private extended properties (like the reschedule request) so it
    // survives description edits and the sheet sync.
    contractSignedName: priv.contractSignedName || '',
    contractSignedAt: priv.contractSignedAt || '',
    contractVersion: priv.contractVersion || '',
    htmlLink: e.htmlLink || '',
  };
}

// Same-day timing buffer, in minutes. One artist needs SETUP_TEARDOWN_MIN to
// pack up and set up again regardless of distance, plus real drive time on
// top of that. Crossing pairs are NOT all the same distance: San Francisco to
// Santa Rosa is a genuinely longer, traffic-prone drive than either of those
// to Marin, so each pair gets its own real-world estimate rather than one
// flat "crossing area" number.
const SETUP_TEARDOWN_MIN = 30;
const SAME_AREA_DRIVE_MIN = 30;
const DRIVE_MINUTES = {
  'Marin|San Francisco': 60,
  'Marin|Santa Rosa': 60,
  'San Francisco|Santa Rosa': 90,
};
// Used when a location's area can't be resolved at all: the most conservative
// (longest) pair, since guessing short and being wrong is the risky direction.
const UNKNOWN_PAIR_DRIVE_MIN = 90;

function driveMinutesBetween(areaA, areaB) {
  if (!areaA || !areaB) return UNKNOWN_PAIR_DRIVE_MIN;
  if (areaA === areaB) return SAME_AREA_DRIVE_MIN;
  return DRIVE_MINUTES[[areaA, areaB].sort().join('|')] ?? UNKNOWN_PAIR_DRIVE_MIN;
}

// Below this, even a short hop isn't realistic; treated as 'urgent' rather
// than 'tight'. Below 0 (the times actually overlap) it's 'overlap' instead,
// which is a hard stop, not a timing judgment call.
const URGENT_FLOOR_MIN = 15;

function toMinutesOfDay(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Compares a candidate booking's date/time/location against every other real
 * booking already on the calendar that day, and classifies how much of a
 * travel buffer is left. Used both by Sky (before she books, and again to
 * decide what to tell the client) and by the owner dashboard (as a warning,
 * never a block, when adding a booking manually).
 *
 * Returns the WORST case across every other booking that day:
 *   - 'clear'   comfortable gap, nothing worth mentioning
 *   - 'tight'   real but short gap (>= 15 min, under the comfortable buffer)
 *   - 'urgent'  under 15 minutes; still sequential, but needs a fast answer
 *   - 'overlap' the times actually overlap — not a timing judgment, just impossible for one artist
 *
 * needsLocationClarification is true when the NEW booking's own location
 * didn't resolve to Marin/SF/Santa Rosa and another booking exists that day,
 * so the area comparison defaulted to the more conservative crossing-area
 * buffer rather than a real answer.
 */
export async function assessSameDayTiming({ date, startTime, endTime, location, excludeEventId }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.list({
    calendarId,
    timeMin: `${date}T00:00:00-08:00`,
    timeMax: `${date}T23:59:59-08:00`,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const others = (result.data.items || [])
    .filter((e) => e.id !== excludeEventId)
    .map(parseEventToBooking)
    .filter(Boolean);

  const clear = { status: 'clear', gapMinutes: null, needsLocationClarification: false };
  if (!others.length) return clear;

  const newArea = resolveArea(location);
  const newStart = toMinutesOfDay(startTime);
  const newEnd = toMinutesOfDay(endTime);
  if (newStart == null || newEnd == null) return clear;

  const rank = { clear: 0, tight: 1, urgent: 2, overlap: 3 };
  let worst = { status: 'clear', gapMinutes: Infinity, needsLocationClarification: false };

  for (const other of others) {
    const [otherStartRaw, otherEndRaw] = (other.time || '').split(' - ');
    const otherStart = toMinutesOfDay(otherStartRaw);
    const otherEnd = toMinutesOfDay(otherEndRaw || otherStartRaw);
    if (otherStart == null || otherEnd == null) continue; // no usable time to compare against

    let gap;
    if (newStart < otherEnd && otherStart < newEnd) {
      gap = -1; // literal overlap
    } else if (newStart >= otherEnd) {
      gap = newStart - otherEnd; // new booking is after this one
    } else {
      gap = otherStart - newEnd; // new booking is before this one
    }

    const otherArea = resolveArea(other.location);
    const comfortable = SETUP_TEARDOWN_MIN + driveMinutesBetween(newArea, otherArea);

    let status;
    if (gap < 0) status = 'overlap';
    else if (gap < URGENT_FLOOR_MIN) status = 'urgent';
    else if (gap < comfortable) status = 'tight';
    else status = 'clear';

    const needsLocationClarification = !newArea && status !== 'clear';

    if (rank[status] > rank[worst.status] || (rank[status] === rank[worst.status] && gap < worst.gapMinutes)) {
      worst = { status, gapMinutes: gap, needsLocationClarification };
    }
  }

  return worst;
}

/**
 * Lists all face painting bookings on the calendar from 30 days ago through
 * 12 months out, as normalized booking objects. Used by the sheet sync so the
 * tracker mirrors whatever currently exists on the calendar.
 */
export const listCalendarBookings = cached('calendarBookings', async () => {
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
});

/**
 * Looks for a booking that already exists for this phone (or email) on this
 * date, so a client who submits the form twice — or who booked with Sky and
 * then used the form — doesn't end up with two events on your calendar.
 * Returns the existing booking, or null.
 */
export async function findDuplicateBooking({ phone, email, date }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const result = await calendar.events.list({
    calendarId,
    timeMin: `${date}T00:00:00-08:00`,
    timeMax: `${date}T23:59:59-08:00`,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const wantPhone = digits(phone);
  const wantEmail = String(email || '').trim().toLowerCase();

  for (const event of result.data.items || []) {
    const booking = parseEventToBooking(event);
    if (!booking) continue;
    const samePhone = wantPhone && digits(booking.phone) === wantPhone;
    const sameEmail =
      wantEmail && String(booking.email || '').trim().toLowerCase() === wantEmail;
    if (samePhone || sameEmail) return booking;
  }
  return null;
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
    // So the confirmation email doesn't nag someone who already signed.
    contractSigned: !!parsed.contractSignedAt,
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
    // So the confirmation email doesn't nag someone who already signed.
    contractSigned: !!parsed.contractSignedAt,
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

  // Unlike Sky, the owner always gets final say — this is a warning surfaced
  // to the caller, never a block, even for a literal overlap. You might know
  // something the system doesn't (a correction, a helper covering it).
  const timing = await assessSameDayTiming({
    date: d.date,
    startTime: d.startTime,
    endTime,
    location: d.location || '',
  });

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
  return { ...parseEventToBooking(created), timingWarning: timing.status !== 'clear' ? timing : null };
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
/**
 * A big group squeezed into a single hour means the artist must plan smaller,
 * quicker designs. Sky is unreliable about noting this herself and it's fully
 * derivable from the booking, so work it out rather than asking her.
 * Returns '' when it doesn't apply.
 */
export function artistPrepNote({ startTime, endTime, guestCount }) {
  const s = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || ''));
  const e = /^(\d{1,2}):(\d{2})$/.exec(String(endTime || ''));
  if (!s || !e) return '';
  const hours = (+e[1] + +e[2] / 60) - (+s[1] + +s[2] / 60);
  const bigGroup = /13-22|23\+/.test(String(guestCount || ''));
  return hours > 0 && hours <= 1 && bigGroup
    ? 'Large group in a single hour, plan smaller and quicker designs.'
    : '';
}

/**
 * Sets the event location. Used when a client books before they've settled on a
 * venue and sends the address later from their status page. Updates both the
 * calendar event's location field and the "Location:" line in the description
 * that parseEventToBooking reads back.
 */
export async function updateBookingLocation(eventId, location) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const description = String(event.description || '');
  const updated = /^Location:\s*.*$/m.test(description)
    ? description.replace(/^Location:\s*.*$/m, `Location: ${location}`)
    : `${description}\nLocation: ${location}`;

  await calendar.events.patch({
    calendarId,
    eventId,
    resource: {
      location,
      description: updated
        // Drop the "confirm with client" nudge now that we have it.
        .replace(/^.*Street address not given yet, confirm with client\.?\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n'),
    },
    sendUpdates: 'none',
  });

  return parseEventToBooking({ ...event, location, description: updated });
}

/**
 * Records the client's e-signature on the booking agreement. Typed name +
 * timestamp + the version of the terms they saw, stored on the event so the
 * owner dashboard, status page and printable contract all read the same fact.
 * Idempotent: a second signature does not overwrite the first — the first
 * signature is the one that counts.
 */
export async function signContract(eventId, { name, version }) {
  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.get({ calendarId, eventId });
  const priv = event.extendedProperties?.private || {};
  if (priv.contractSignedAt) return { booking: parseEventToBooking(event), alreadySigned: true };

  const { data: updated } = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: 'none',
    resource: {
      extendedProperties: {
        private: {
          ...priv,
          contractSignedName: String(name || '').slice(0, 120),
          contractSignedAt: new Date().toISOString(),
          contractVersion: String(version || ''),
        },
      },
    },
  });

  return { booking: parseEventToBooking(updated), alreadySigned: false };
}

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
    // Which surface created this booking, for the calendar note and so the
    // owner can see which path converts. Defaults to Sky, so her existing flow
    // in api/chat.js is completely unchanged.
    source = 'sky',
    // Context for the artist to prep with: who the party is for, whether it's
    // kids or adults, the company and occasion for corporate, plus anything the
    // client volunteered. All optional — omitted fields simply don't appear.
    details = {},
  } = bookingData;

  const artistNotes = [details.specialRequests, artistPrepNote({ startTime, endTime, guestCount })]
    .filter(Boolean)
    .join(' · ');

  // Same-day timing check against any other real booking that day. A literal
  // overlap is a hard stop, not a judgment call, no artist confirmation makes
  // one person able to be in two places at the same minute.
  const timing = await assessSameDayTiming({ date, startTime, endTime, location });
  if (timing.status === 'overlap') {
    const err = new Error('That time overlaps another booking on the same day.');
    err.code = 'OVERLAP';
    throw err;
  }

  // Each becomes its own line in the calendar event, so the artist can scan it
  // rather than dig through a paragraph of notes.
  // Same-day requests still need a human look before they go out, since
  // there's no runway left to fix a mistake if something's wrong. Anything
  // for a future date confirms immediately, tight/urgent timing included,
  // that risk doesn't go away with more notice, but it's no longer a reason
  // to hold up the booking, just a reason to flag it for awareness.
  const today = toPacificDate(new Date());
  const isPending = date === today;

  const detailLines = [
    details.honoree ? `Birthday star: ${details.honoree}` : '',
    details.companyName ? `Company: ${details.companyName}` : '',
    details.occasion ? `Occasion: ${details.occasion}` : '',
    details.guestMix ? `Guest mix: ${details.guestMix}` : '',
    artistNotes ? `Special requests: ${artistNotes}` : '',
    details.customRequest
      ? `⚠️ CUSTOM DESIGN REQUEST: ${details.customRequest} — discuss with the client before the event`
      : '',
    details.secondArtistRequested
      ? `⚠️ WANTED A SECOND ARTIST: ${details.secondArtistRequested} — see if one can be arranged`
      : '',
    details.paperworkRequest
      ? `⚠️ PAPERWORK NEEDED: ${details.paperworkRequest} — sort before the event`
      : '',
    timing.status === 'urgent'
      ? isPending
        ? `🚨 URGENT TIMING: only ~${timing.gapMinutes} min against another booking the same day. Needs a fast answer.`
        : `🚨 URGENT TIMING (already confirmed): only ~${timing.gapMinutes} min against another booking the same day.`
      : timing.status === 'tight'
        ? isPending
          ? `⏱ TIGHT TIMING: ~${timing.gapMinutes} min against another booking the same day. Confirm this is workable.`
          : `⏱ TIGHT TIMING (already confirmed): ~${timing.gapMinutes} min against another booking the same day.`
        : '',
  ].filter(Boolean);

  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  const startDateTime = `${date}T${startTime}:00`;
  const endDateTime = `${date}T${endTime}:00`;

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
      ...detailLines,
      notes ? `Notes: ${notes}` : '',
      '',
      source === 'form'
        ? 'Booked through the website booking form'
        : source === 'chat'
        ? 'Booked in the chat with Sky (client filled the details form)'
        : "Booked by Sky, Face Painting California's assistant",
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
    timingStatus: timing.status,
  };
}

// Vercel serverless handler (for direct API calls if needed)
// NOTE: This module intentionally exposes NO public HTTP handler.
// Bookings are created only through the Sky assistant flow in api/chat.js,
// which imports createBooking()/checkAvailability() directly. Exporting a
// default handler here would create an unauthenticated /api/book endpoint that
// anyone could POST to in order to spam the real Google Calendar.
