import { useRef, useState } from 'react';
import DatePicker from './DatePicker';
import {
  START_TIMES,
  computeQuote,
  formatMoney,
  formatDateLong,
  formatTime,
  endTimeFor,
  isEmail,
  isPhone,
} from '../lib/booking';

// Structured widgets Sky can drop into the conversation.
//
// The point of these is speed WITHOUT losing the conversation: tapping a chip
// just sends that text as a normal message, so Sky still sees a transcript and
// can react to it, and the client can always ignore the widget and type
// something she didn't offer ("30 kids but half are toddlers").
//
// Anything deterministic — the price math, the calendar — runs here in the
// browser rather than round-tripping through the model, so it's instant and
// costs nothing.

const cardClass = 'bg-white border border-navy/10 rounded-2xl p-3.5 mt-2';

/** Tappable answers to whatever Sky just asked. */
export function Chips({ options, onPick, disabled }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(opt)}
          className="bg-white border-2 border-coral/25 hover:border-coral hover:bg-coral/5 disabled:opacity-40 text-navy font-body font-bold text-xs px-3.5 py-2 rounded-full transition-colors active:scale-95"
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Availability-aware calendar, inline in the chat. */
export function DatePickerCard({ onPick, disabled }) {
  return (
    <div className="mt-2">
      <DatePicker
        value=""
        onChange={(date) => {
          if (!disabled) onPick(formatDateLong(date), date);
        }}
      />
    </div>
  );
}

// Sensible bounds for the custom picker, so nobody books 4am by spinning the
// wheel too far. Adjust if the artists ever work outside these.
const EARLIEST_START = '08:00';
const LATEST_START = '20:00';

/**
 * Start-time chips, plus an escape hatch.
 *
 * The chips cover most parties in one tap. "Other time" opens a native time
 * input — a scroll wheel on a phone, no typing — and shows the resulting range
 * live, so the client sees what they're actually committing to before they
 * confirm. Seeing the consequence is what makes it feel like a choice rather
 * than a menu.
 */
export function TimeCard({ hours = 2, onPick, disabled }) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const range = (start) => {
    const end = endTimeFor(start, hours);
    return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
  };

  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1.5">
        {START_TIMES.map((t) => (
          <button
            key={t.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t.label, t.value)}
            className="bg-white border-2 border-navy/10 hover:border-coral disabled:opacity-40 text-navy font-body font-bold text-[11px] py-2 rounded-lg transition-colors active:scale-95"
          >
            {t.label}
          </button>
        ))}
      </div>

      {!showCustom ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowCustom(true)}
          className="w-full mt-1.5 text-navy/50 hover:text-coral disabled:opacity-40 font-body font-bold text-[11px] py-2 underline transition-colors"
        >
          Another time
        </button>
      ) : (
        <div className={cardClass}>
          <label className="block font-body font-bold text-navy text-xs mb-1.5">
            What time does it start?
          </label>
          <input
            type="time"
            value={custom}
            min={EARLIEST_START}
            max={LATEST_START}
            step={300}
            onChange={(e) => setCustom(e.target.value)}
            className="w-full border border-navy/15 rounded-xl px-3 py-2 font-body text-sm bg-white focus:outline-none"
          />
          <p className="font-body text-navy/45 text-[11px] mt-2">
            {custom
              ? `Your ${hours} ${hours === 1 ? 'hour' : 'hours'} would run ${range(custom)}.`
              : `Anywhere from ${formatTime(EARLIEST_START)} to ${formatTime(LATEST_START)}.`}
          </p>
          <button
            type="button"
            disabled={!custom || disabled}
            onClick={() => onPick(formatTime(custom), custom)}
            className="w-full mt-2.5 bg-coral hover:bg-coral-dark disabled:opacity-40 text-white font-body font-extrabold text-sm py-2.5 rounded-full transition-colors active:scale-[0.99]"
          >
            Use this time
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Itemised price, computed in the browser from the same function the server
 * uses. Sky passes the inputs; the arithmetic never goes near the model.
 */
export function QuoteCard({ city, hours, secondArtist, onAccept, disabled }) {
  const q = computeQuote({ city, hours, secondArtist });
  if (!q.inServiceArea) return null;

  const rows = [
    [`${hours} ${hours === 1 ? 'hour' : 'hours'} of face painting`, q.hoursPrice],
    ...(secondArtist ? [['Second artist', q.secondArtistFee]] : []),
    [`Travel to ${q.area}`, q.travelFee],
  ];

  return (
    <div className={cardClass}>
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-3 py-1 text-sm">
          <span className="font-body text-navy/55">{label}</span>
          <span className="font-body font-bold text-navy">
            {amount ? formatMoney(amount) : 'Free'}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-3 pt-2 mt-1.5 border-t border-navy/10">
        <span className="font-body font-bold text-navy text-sm">Total</span>
        <span className="font-display text-coral text-lg leading-none">
          {formatMoney(q.total)}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAccept('That works, let\'s book it')}
        className="w-full mt-3 bg-coral hover:bg-coral-dark disabled:opacity-40 text-white font-body font-extrabold text-sm py-2.5 rounded-full transition-colors active:scale-[0.99]"
      >
        Book this
      </button>
    </div>
  );
}

const inputClass =
  'w-full border border-navy/15 rounded-xl px-3 py-2 font-body text-sm bg-white focus:outline-none';

/**
 * The one part a form genuinely does better than a conversation: four identity
 * fields, filled by the browser's autofill in a single tap instead of four
 * rounds of typing. Posts straight to /api/booking — no model round trip.
 */
export function DetailsForm({ booking, transcript, onSubmitted, disabled }) {
  // No `notes` or `details` key here on purpose: Sky gathers those and passes
  // them in `booking`, and these values are spread over it. An empty field here
  // would silently wipe what she wrote down.
  const [values, setValues] = useState({ name: '', email: '', phone: '', address: '' });
  // Deliberately neutral: a catch-all for allergies, parking, a nervous child.
  // It never mentions themes or designs, so it can't read as an offer of custom
  // work — that stays a conversation with the team.
  const [extra, setExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const honeypotRef = useRef(null);

  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const ready =
    values.name.trim().length > 1 && isEmail(values.email) && isPhone(values.phone);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...booking,
          ...values,
          // Merge rather than replace, so what the client types here is added to
          // whatever Sky already noted instead of overwriting it.
          details: {
            ...(booking.details || {}),
            specialRequests: [booking.details?.specialRequests, extra.trim()]
              .filter(Boolean)
              .join(' · '),
          },
          source: 'chat',
          // The conversation only exists in this browser, so send it along or
          // the team never sees what was actually discussed.
          transcript,
          website: honeypotRef.current?.value || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please text us at 415-991-9374.');
        return;
      }
      onSubmitted({ duplicate: Boolean(data.duplicate), pending: data.pending !== false, name: values.name, booking });
    } catch {
      setError("That didn't send. Check your connection, or text us at 415-991-9374.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="space-y-2">
        <input
          type="text"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          autoComplete="name"
          placeholder="Your name"
          className={inputClass}
        />
        <input
          type="email"
          value={values.email}
          onChange={(e) => set({ email: e.target.value })}
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          className={inputClass}
        />
        <input
          type="tel"
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
          autoComplete="tel"
          inputMode="tel"
          placeholder="Phone"
          className={inputClass}
        />
        {/* This is the EVENT location, not the client's home. The label has to
            say so: browser autofill offers their home address, which is right
            for a party at home and badly wrong for one at a park. */}
        <input
          type="text"
          value={values.address}
          onChange={(e) => set({ address: e.target.value })}
          autoComplete="street-address"
          placeholder="Where's the party? Address or venue"
          className={inputClass}
        />
        <p className="font-body text-navy/40 text-[11px] -mt-1 px-1">
          Not booked a venue yet? Leave it blank and send it over later.
        </p>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={2}
          // Kept short on purpose: a longer placeholder gets clipped mid-word
          // in this two-row box at phone width.
          placeholder="Allergies, parking, anything else? (optional)"
          className={`${inputClass} resize-none`}
        />
        {/* Honeypot: hidden from people, tempting to bots. */}
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute opacity-0 pointer-events-none h-0 w-0"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 font-body text-xs text-coral-dark leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!ready || submitting || disabled}
        onClick={submit}
        className="w-full mt-3 bg-coral hover:bg-coral-dark disabled:opacity-40 text-white font-body font-extrabold text-sm py-2.5 rounded-full transition-colors active:scale-[0.99]"
      >
        {submitting ? 'Sending…' : 'Send my request'}
      </button>
      <p className="font-body text-navy/40 text-[11px] text-center mt-2">
        No payment now. We'll confirm by text.
      </p>
    </div>
  );
}

/** Shown in place of the form once the request is in. */
export function SuccessCard({ result }) {
  const b = result.booking || {};
  const compact = (b.date || '').replace(/-/g, '');
  const start = (b.startTime || '').replace(':', '') + '00';
  const end = (endTimeFor(b.startTime, b.hours) || '').replace(':', '') + '00';
  const calUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Face Painting California',
    dates: `${compact}T${start}/${compact}T${end}`,
    ctz: 'America/Los_Angeles',
    location: b.address || b.city || '',
    details: 'Your face painting booking request with Face Painting California.',
  })}`;

  return (
    <div className={cardClass}>
      <div className="text-center">
        <div className="text-2xl mb-1.5">🎉</div>
        <p className="font-display text-navy text-base mb-1">
          {result.duplicate ? "You're already on our list" : result.pending ? 'Request sent!' : "You're booked!"}
        </p>
        <p className="font-body text-navy/55 text-xs leading-relaxed">
          {result.duplicate
            ? 'We already had a request from you for that date. The team is on it.'
            : result.pending
              ? `We'll confirm ${formatDateLong(b.date)}${
                  b.startTime ? ` at ${formatTime(b.startTime)}` : ''
                } by text, usually within a few hours. A copy is on its way to your email.`
              : `You're all set for ${formatDateLong(b.date)}${
                  b.startTime ? ` at ${formatTime(b.startTime)}` : ''
                }. A confirmation is on its way to your email.`}
        </p>
      </div>
      {b.date && (
        <a
          href={calUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center mt-3 bg-white border-2 border-navy/10 hover:border-coral/40 text-navy font-body font-bold text-xs py-2.5 rounded-full transition-colors"
        >
          📅 Save the date
        </a>
      )}
    </div>
  );
}
