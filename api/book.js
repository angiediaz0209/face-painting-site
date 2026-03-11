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
 * Creates a Google Calendar event for a face painting booking.
 * Called internally by the chat handler when Sky triggers a booking.
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
  } = bookingData;

  const auth = getAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const calendar = google.calendar({ version: 'v3', auth });

  // Build date-time strings (e.g. date="2026-03-22", startTime="14:00", endTime="16:00")
  const startDateTime = `${date}T${startTime}:00`;
  const endDateTime = `${date}T${endTime}:00`;

  const event = {
    summary: `Face Painting - ${clientName} (${eventType})`,
    description: [
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
    attendees: [{ email: clientEmail, displayName: clientName }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'email', minutes: 48 * 60 }, // 2 days before
      ],
    },
  };

  const result = await calendar.events.insert({
    calendarId,
    resource: event,
    sendUpdates: 'all', // Sends email invite to the client
  });

  return {
    success: true,
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
