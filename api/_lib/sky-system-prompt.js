import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sky's instructions live in SKY_INSTRUCTIONS.md, committed to the PRIVATE repo
// so they deploy with the code and can be updated with a normal git push. The
// file is the source of truth. The SKY_INSTRUCTIONS env var is only a fallback
// if the file is ever unavailable (and is otherwise ignored).
function loadSkyInstructions() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', '..', 'SKY_INSTRUCTIONS.md'), 'utf-8');
  } catch {
    if (process.env.SKY_INSTRUCTIONS && process.env.SKY_INSTRUCTIONS.trim()) {
      return process.env.SKY_INSTRUCTIONS;
    }
    throw new Error(
      'Sky instructions missing: SKY_INSTRUCTIONS.md not found and SKY_INSTRUCTIONS env var not set.'
    );
  }
}

const skyInstructions = loadSkyInstructions();

export default function getSkySystemPrompt({ secondArtistAvailable = false } = {}) {
  // Get current date/time in Pacific Time reliably
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dateStr = formatter.format(new Date());

  // Also get the ISO date for Sky to use in tool calls
  const isoFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const isoDate = isoFormatter.format(new Date()); // YYYY-MM-DD format

  // Owner-controlled, from the Settings tab. Sky must never sell a second
  // artist when there isn't one to send.
  const secondArtistBlock = secondArtistAvailable
    ? `SECOND ARTIST: AVAILABLE today. You may recommend a second artist as described in your instructions.`
    : `SECOND ARTIST: NOT AVAILABLE right now. There is currently only one artist.
- Never recommend, offer, or mention a second artist on your own.
- Never show a price card that includes a second artist.
- For large groups, recommend more hours instead, and be honest that in one hour a single artist gets through about 10 to 12 children with quick designs.
- If the CLIENT asks for a second artist, do not say no and do not promise one. Say the team will check whether a second artist can be arranged for their date, and record it in secondArtistRequested when you show the details form. Then carry on with the booking.`;

  return `TODAY'S DATE: ${dateStr} (${isoDate})

${secondArtistBlock}

IMPORTANT: Today is ${dateStr}. The current year is ${new Date().getFullYear()}. When a client mentions a date like "this Saturday" or "next Friday", interpret it relative to today's date above. All bookings MUST be in the future — never create a booking for a past date. If the client says a date that has already passed, gently clarify: "Did you mean [next occurrence]?" Always assume clients are booking for the nearest upcoming date unless they specify otherwise. When using tools, dates must be in YYYY-MM-DD format and must be on or after ${isoDate}.

---

${skyInstructions}`;
}
