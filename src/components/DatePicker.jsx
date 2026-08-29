import { useEffect, useMemo, useState } from 'react';
import { todayPacific } from '../lib/booking';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthLabel(year, month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1)
  );
}

function iso(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Month grid that greys out days already taken on the calendar. Days that only
 * have a timed booking stay selectable (more than one event a day is fine when
 * there's room between them) and get a small dot instead.
 *
 * Availability comes from /api/booking?action=availability, which returns dates
 * only — never event details. If that call fails the grid still works, it just
 * can't grey anything out; the team approves every booking anyway.
 */
export default function DatePicker({ value, onChange }) {
  const today = todayPacific();
  const [year, setYear] = useState(() => Number((value || today).slice(0, 4)));
  const [month, setMonth] = useState(() => Number((value || today).slice(5, 7)) - 1);
  const [busy, setBusy] = useState(new Set());
  const [partial, setPartial] = useState(new Set());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  // Don't let anyone page back before the current month.
  const atFirstMonth =
    year < Number(today.slice(0, 4)) ||
    (year === Number(today.slice(0, 4)) && month <= Number(today.slice(5, 7)) - 1);

  useEffect(() => {
    let cancelled = false;
    const from = iso(year, month, 1);
    const to = iso(year, month, daysInMonth);

    fetch(`/api/booking?action=availability&from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : { busyDates: [], partialDates: [] }))
      .then((data) => {
        if (cancelled) return;
        setBusy(new Set(data.busyDates || []));
        setPartial(new Set(data.partialDates || []));
      })
      .catch(() => {
        if (cancelled) return;
        setBusy(new Set());
        setPartial(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [year, month, daysInMonth]);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [firstWeekday, daysInMonth]);

  const step = (delta) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <div className="bg-white border border-navy/10 rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atFirstMonth}
          aria-label="Previous month"
          className="w-9 h-9 rounded-full flex items-center justify-center text-navy hover:bg-cream disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          ‹
        </button>
        <div className="font-body font-bold text-navy text-sm" aria-live="polite">
          {monthLabel(year, month)}
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="w-9 h-9 rounded-full flex items-center justify-center text-navy hover:bg-cream transition-colors"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[11px] font-body font-bold text-navy/35 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} />;
          const date = iso(year, month, day);
          const isPast = date < today;
          const isBusy = busy.has(date);
          const isPartial = !isBusy && partial.has(date);
          const disabled = isPast || isBusy;
          const selected = value === date;

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onChange(date)}
              aria-label={`${date}${
                isBusy ? ', already booked' : isPartial ? ', has another event, some times open' : ''
              }`}
              aria-pressed={selected}
              className={`relative aspect-square rounded-xl text-sm font-body font-bold transition-colors ${
                selected
                  ? 'bg-coral text-white'
                  : disabled
                  ? 'text-navy/20 line-through cursor-not-allowed'
                  : 'text-navy hover:bg-coral/10'
              }`}
            >
              {day}
              {isPartial && !isPast && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                    selected ? 'bg-white' : 'bg-coral'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-body text-navy/40 text-center mt-3">
        Crossed out days are booked. Dotted days have another event, some times are open
      </p>
    </div>
  );
}
