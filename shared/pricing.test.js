// Tests for shared/pricing.js — the single source of truth for every quote.
// A wrong number here reaches real clients, so each pricing rule from the
// module's comments gets its own case. Tests describe behaviour ("charges $35
// travel to San Francisco"), not implementation.
import { describe, it, expect } from 'vitest';
import { computeQuote, resolveArea } from './pricing.js';

describe('resolveArea', () => {
  it.each([
    ['San Rafael', 'Marin'],
    ['mill valley, CA', 'Marin'],
    ['Marin County', 'Marin'],
    ['San Francisco', 'San Francisco'],
    ['SF', 'San Francisco'],
    ['san fran', 'San Francisco'],
    ['Santa Rosa', 'Santa Rosa'],
  ])('maps "%s" to %s', (city, area) => {
    expect(resolveArea(city)).toBe(area);
  });

  it('ignores case, punctuation and extra whitespace', () => {
    expect(resolveArea('  NOVATO.  ')).toBe('Marin');
  });

  it('returns null for cities outside the service area', () => {
    expect(resolveArea('Los Angeles')).toBeNull();
    expect(resolveArea('Sacramento')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveArea('')).toBeNull();
    expect(resolveArea(undefined)).toBeNull();
  });
});

describe('computeQuote', () => {
  describe('service area', () => {
    it('flags out-of-area cities and echoes the city back', () => {
      expect(computeQuote({ city: 'Los Angeles', hours: 2 })).toEqual({
        inServiceArea: false,
        city: 'Los Angeles',
      });
    });

    it('handles a missing city without throwing', () => {
      expect(computeQuote({})).toEqual({ inServiceArea: false, city: '' });
    });
  });

  describe('package pricing', () => {
    it('charges $150 for one hour', () => {
      const q = computeQuote({ city: 'San Rafael', hours: 1 });
      expect(q.hoursPrice).toBe(150);
      expect(q.total).toBe(150);
    });

    it('charges $300 for two hours', () => {
      expect(computeQuote({ city: 'San Rafael', hours: 2 }).total).toBe(300);
    });

    it('adds $100 for each hour beyond two', () => {
      expect(computeQuote({ city: 'San Rafael', hours: 3 }).total).toBe(400);
      expect(computeQuote({ city: 'San Rafael', hours: 5 }).total).toBe(600);
    });

    it('defaults to the two-hour package when hours are missing or invalid', () => {
      for (const hours of [undefined, 0, -1, 'abc']) {
        const q = computeQuote({ city: 'San Rafael', hours });
        expect(q.hours).toBe(2);
        expect(q.total).toBe(300);
      }
    });

    it('accepts hours passed as a numeric string', () => {
      expect(computeQuote({ city: 'San Rafael', hours: '3' }).total).toBe(400);
    });
  });

  describe('travel fee', () => {
    it('is free within Marin', () => {
      expect(computeQuote({ city: 'Tiburon', hours: 2 }).travelFee).toBe(0);
    });

    it('is $35 to San Francisco', () => {
      const q = computeQuote({ city: 'San Francisco', hours: 2 });
      expect(q.travelFee).toBe(35);
      expect(q.total).toBe(335);
    });

    it('is $35 to Santa Rosa', () => {
      const q = computeQuote({ city: 'Santa Rosa', hours: 2 });
      expect(q.travelFee).toBe(35);
      expect(q.total).toBe(335);
    });
  });

  describe('second artist', () => {
    it('adds $200 when requested', () => {
      const q = computeQuote({ city: 'San Rafael', hours: 2, secondArtist: true });
      expect(q.secondArtistFee).toBe(200);
      expect(q.total).toBe(500);
    });

    it('adds nothing by default', () => {
      expect(computeQuote({ city: 'San Rafael', hours: 2 }).secondArtistFee).toBe(0);
    });
  });

  describe('loyalty pricing for returning clients', () => {
    it('steps up $25 from the last quote when rebooking the same package', () => {
      const q = computeQuote({ city: 'San Rafael', hours: 2, lastQuote: 200, lastHours: 2 });
      expect(q.total).toBe(225);
      expect(q.regularTotal).toBe(300);
      expect(q.loyaltyApplied).toBe(true);
    });

    it('never charges more than the regular price', () => {
      const q = computeQuote({ city: 'San Rafael', hours: 2, lastQuote: 290, lastHours: 2 });
      expect(q.total).toBe(300);
      expect(q.loyaltyApplied).toBe(false);
    });

    it('does not apply when the client books a different package', () => {
      const q = computeQuote({ city: 'San Rafael', hours: 3, lastQuote: 200, lastHours: 2 });
      expect(q.total).toBe(400);
      expect(q.loyaltyApplied).toBe(false);
    });

    it('ignores a missing or zero last quote', () => {
      expect(computeQuote({ city: 'San Rafael', hours: 2, lastQuote: 0, lastHours: 2 }).total).toBe(300);
      expect(computeQuote({ city: 'San Rafael', hours: 2, lastHours: 2 }).total).toBe(300);
    });

    it('absorbs the discount into the package line so the breakdown still sums to the total', () => {
      const q = computeQuote({
        city: 'San Francisco', hours: 2, secondArtist: true, lastQuote: 400, lastHours: 2,
      });
      // regular: 300 + 35 + 200 = 535; loyalty: 400 + 25 = 425
      expect(q.total).toBe(425);
      expect(q.travelFee).toBe(35);
      expect(q.secondArtistFee).toBe(200);
      expect(q.hoursPrice + q.travelFee + q.secondArtistFee).toBe(q.total);
    });
  });

  it('returns the full breakdown shape for an in-area quote', () => {
    expect(computeQuote({ city: 'Novato', hours: 2 })).toEqual({
      inServiceArea: true,
      area: 'Marin',
      hours: 2,
      hoursPrice: 300,
      secondArtistFee: 0,
      travelFee: 0,
      total: 300,
      regularTotal: 300,
      loyaltyApplied: false,
    });
  });
});
