// Tests for the booking-widget helpers. All pure functions except
// todayPacific(), which we pin to a fixed clock with fake timers.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isEmail, isPhone, endTimeFor, formatMoney, formatDateLong, formatTime, todayPacific,
} from './booking.js';

describe('isEmail', () => {
  it.each(['sky@example.com', ' Jane.Doe+party@example.org '])('accepts %s', (v) => {
    expect(isEmail(v)).toBe(true);
  });

  it.each(['', 'notanemail', 'a@b', 'a@b.c', 'a b@c.com', null, undefined])('rejects %s', (v) => {
    expect(isEmail(v)).toBe(false);
  });
});

describe('isPhone', () => {
  it('accepts 10+ digits in any format', () => {
    expect(isPhone('4155551234')).toBe(true);
    expect(isPhone('(415) 555-1234')).toBe(true);
    expect(isPhone('+1 415 555 1234')).toBe(true);
  });

  it('rejects fewer than 10 digits or empty input', () => {
    expect(isPhone('555-1234')).toBe(false);
    expect(isPhone('')).toBe(false);
    expect(isPhone(undefined)).toBe(false);
  });
});

describe('endTimeFor', () => {
  it('adds the package length to the start time', () => {
    expect(endTimeFor('10:00', 2)).toBe('12:00');
    expect(endTimeFor('14:30', 3)).toBe('17:30');
  });

  it('defaults to a two-hour package', () => {
    expect(endTimeFor('10:00')).toBe('12:00');
  });

  it('wraps past midnight', () => {
    expect(endTimeFor('23:00', 2)).toBe('01:00');
  });

  it('returns an empty string for an invalid start time', () => {
    expect(endTimeFor('noon', 2)).toBe('');
    expect(endTimeFor('', 2)).toBe('');
  });
});

describe('formatMoney', () => {
  it('formats with a dollar sign and thousands separators', () => {
    expect(formatMoney(300)).toBe('$300');
    expect(formatMoney(1250)).toBe('$1,250');
  });

  it('treats missing values as zero', () => {
    expect(formatMoney(undefined)).toBe('$0');
  });
});

describe('formatDateLong', () => {
  it('renders an ISO date as a long weekday/month/day string', () => {
    expect(formatDateLong('2026-08-29')).toBe('Saturday, August 29');
  });

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatDateLong('soon')).toBe('soon');
  });

  it('returns an empty string for empty input', () => {
    expect(formatDateLong('')).toBe('');
  });
});

describe('formatTime', () => {
  it('uses the friendly label for a known start time', () => {
    expect(formatTime('13:00')).toBe('1:00 PM');
  });

  it('converts other 24h times to 12h', () => {
    expect(formatTime('09:30')).toBe('9:30 AM');
    expect(formatTime('00:15')).toBe('12:15 AM');
    expect(formatTime('12:45')).toBe('12:45 PM');
  });

  it('passes through unrecognised input', () => {
    expect(formatTime('later')).toBe('later');
    expect(formatTime('')).toBe('');
  });
});

describe('todayPacific', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the date in Pacific time, not UTC', () => {
    // 03:00 UTC on Aug 28 is still 20:00 on Aug 27 in Los Angeles.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T03:00:00Z'));
    expect(todayPacific()).toBe('2026-08-27');
  });
});
