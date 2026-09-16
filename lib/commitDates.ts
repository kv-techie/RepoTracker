/**
 * Date helpers for commit analytics.
 * All day bucketing uses the viewer's local calendar day, so the heatmap, streaks
 * and hour charts agree with each other (ISO strings are UTC and shift days east of UTC).
 */

import type { Commit } from '@/types/repo';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a YYYY-MM-DD key back to local midnight. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Drop duplicate commits (same SHA from the agent and from GitHub). */
export function dedupeCommits<T extends Pick<Commit, 'sha'>>(commits: T[]): T[] {
  return [...new Map(commits.map(c => [c.sha, c])).values()];
}

/** Current and longest daily commit streak, in local days. */
export function computeStreak(commits: Pick<Commit, 'committed_at'>[], now = new Date()): { current: number; longest: number } {
  if (!commits.length) return { current: 0, longest: 0 };

  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const days = [...new Set(commits.map(c => localDayKey(new Date(c.committed_at))))].sort().reverse();

  let current = 0;
  let longest = 0;
  let streak = 0;
  let prev: string | null = null;
  // True while walking the unbroken run that ends today or yesterday
  let inCurrentRun = false;

  for (const day of days) {
    if (!prev) {
      inCurrentRun = day === today || day === yesterday;
      streak = 1;
    } else {
      const diffDays = Math.round((parseDayKey(prev).getTime() - parseDayKey(day).getTime()) / 86_400_000);
      if (diffDays === 1) {
        streak += 1;
      } else {
        streak = 1;
        inCurrentRun = false;
      }
    }
    if (inCurrentRun) current = streak;
    if (streak > longest) longest = streak;
    prev = day;
  }
  return { current, longest };
}
