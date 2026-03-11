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
      'Booked via Sky AI',
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
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await createBooking(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Booking error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create booking. Please text us at 415-991-9374.',
    });
  }
}
