// Shared helpers for Sky's in-chat booking widgets.
//
// The price math lives in shared/pricing.js and is imported directly:
// it's a pure function with no Node dependencies, so the browser runs the exact
// same code the server does. That's deliberate — the price card and Sky can never
// quote two different numbers. The server still recomputes the total on submit,
// since anything coming from the browser can be tampered with.
//
// It sits in shared/ rather than api/ because vite.config.js proxies /api to the
// API dev server, which would swallow the module request in development.
import { computeQuote } from '../../shared/pricing.js';

export { computeQuote };

// Common start times, offered as chips. Far faster than a time spinner on a phone.
export const START_TIMES = [
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
  { value: '17:00', label: '5:00 PM' },
];

export function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}

export function isPhone(v) {
  return String(v || '').replace(/\D/g, '').length >= 10;
}

// End time derived from the start time and the package length.
export function endTimeFor(startTime, hours) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || '').trim());
  if (!m) return '';
  const end = (+m[1] + Number(hours || 2)) % 24;
  return `${String(end).padStart(2, '0')}:${m[2]}`;
}

export function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-US')}`;
}

export function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(d);
}

export function formatTime(hhmm) {
  const found = START_TIMES.find((t) => t.value === hhmm);
  if (found) return found.label;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return hhmm || '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Today in Pacific time as YYYY-MM-DD — the earliest bookable date.
export function todayPacific() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

