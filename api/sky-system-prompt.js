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
    return fs.readFileSync(path.join(__dirname, '..', 'SKY_INSTRUCTIONS.md'), 'utf-8');
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

export default function getSkySystemPrompt() {
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

  return `TODAY'S DATE: ${dateStr} (${isoDate})

IMPORTANT: Today is ${dateStr}. The current year is ${new Date().getFullYear()}. When a client mentions a date like "this Saturday" or "next Friday", interpret it relative to today's date above. All bookings MUST be in the future — never create a booking for a past date. If the client says a date that has already passed, gently clarify: "Did you mean [next occurrence]?" Always assume clients are booking for the nearest upcoming date unless they specify otherwise. When using tools, dates must be in YYYY-MM-DD format and must be on or after ${isoDate}.

---

${skyInstructions}`;
}
