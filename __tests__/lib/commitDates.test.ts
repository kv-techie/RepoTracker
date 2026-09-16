/**
 * Tests for lib/commitDates.ts, run in IST where UTC date strings are a day behind local midnight.
 */

process.env.TZ = 'Asia/Kolkata';

import { localDayKey, parseDayKey, dedupeCommits, computeStreak } from '@/lib/commitDates';

describe('localDayKey', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 01:30 IST on 10 March is still 9 March in UTC
    const d = new Date('2026-03-09T20:00:00Z');
    expect(d.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(localDayKey(d)).toBe('2026-03-10');
  });

  it('round-trips local midnight', () => {
    expect(localDayKey(parseDayKey('2026-01-01'))).toBe('2026-01-01');
  });
});

describe('dedupeCommits', () => {
  it('keeps one commit per SHA', () => {
    const out = dedupeCommits([{ sha: 'a' }, { sha: 'b' }, { sha: 'a' }]);
    expect(out.map(c => c.sha)).toEqual(['a', 'b']);
  });
});

describe('computeStreak', () => {
  const now = new Date('2026-09-15T12:00:00+05:30');
  const at = (iso: string) => ({ committed_at: iso });

  it('counts a multi-day run ending today as the current streak', () => {
    const s = computeStreak([
      at('2026-09-15T10:00:00+05:30'),
      at('2026-09-14T23:30:00+05:30'),
      at('2026-09-13T09:00:00+05:30'),
    ], now);
    expect(s).toEqual({ current: 3, longest: 3 });
  });

  it('buckets a just-after-midnight IST commit into the right day', () => {
    // 00:30 IST on 15 Sep is 14 Sep in UTC; together with a 14 Sep commit that is a 2-day run
    const s = computeStreak([at('2026-09-14T19:00:00Z'), at('2026-09-14T10:00:00+05:30')], now);
    expect(s.current).toBe(2);
  });

  it('keeps an older longer run as longest without inflating current', () => {
    const s = computeStreak([
      at('2026-09-14T10:00:00+05:30'),
      at('2026-09-01T10:00:00+05:30'),
      at('2026-08-31T10:00:00+05:30'),
      at('2026-08-30T10:00:00+05:30'),
      at('2026-08-29T10:00:00+05:30'),
    ], now);
    expect(s).toEqual({ current: 1, longest: 4 });
  });

  it('reports no current streak when the last commit is older than yesterday', () => {
    expect(computeStreak([at('2026-09-10T10:00:00+05:30')], now)).toEqual({ current: 0, longest: 1 });
  });
});
