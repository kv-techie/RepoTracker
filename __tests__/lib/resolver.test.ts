/**
 * Tests for lib/resolver.ts — client-side Hybrid Source Resolver.
 */

import { resolveLatestSource, formatSource, timeAgo } from '@/lib/resolver';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe('resolveLatestSource', () => {
  it('picks local_filesystem when it is newest', () => {
    const { source } = resolveLatestSource({
      file_mtime: daysAgo(0),
      local_commit_time: daysAgo(1),
      remote_push_time: daysAgo(2),
    });
    expect(source).toBe('local_filesystem');
  });

  it('picks local_git when file_mtime is missing', () => {
    const { source } = resolveLatestSource({
      file_mtime: null,
      local_commit_time: daysAgo(0),
      remote_push_time: daysAgo(5),
    });
    expect(source).toBe('local_git');
  });

  it('picks github_remote when it is newest', () => {
    const { source } = resolveLatestSource({
      file_mtime: daysAgo(5),
      local_commit_time: daysAgo(4),
      remote_push_time: daysAgo(0),
    });
    expect(source).toBe('github_remote');
  });

  it('returns github_remote and null when all are null', () => {
    const { source, timestamp } = resolveLatestSource({});
    expect(source).toBe('github_remote');
    expect(timestamp).toBeNull();
  });

  it('local_filesystem wins on equal timestamps', () => {
    const same = daysAgo(1);
    const { source } = resolveLatestSource({
      file_mtime: same,
      local_commit_time: same,
      remote_push_time: same,
    });
    expect(source).toBe('local_filesystem');
  });

  it('ignores invalid date strings', () => {
    const { source } = resolveLatestSource({
      file_mtime: 'not-a-date',
      local_commit_time: daysAgo(1),
      remote_push_time: null,
    });
    expect(source).toBe('local_git');
  });

  it('returns a Date object for valid timestamp', () => {
    const { timestamp } = resolveLatestSource({ file_mtime: daysAgo(1) });
    expect(timestamp).toBeInstanceOf(Date);
  });
});

describe('formatSource', () => {
  it('formats local_filesystem', () => expect(formatSource('local_filesystem')).toBe('Local Files'));
  it('formats local_git', () => expect(formatSource('local_git')).toBe('Local Git'));
  it('formats github_remote', () => expect(formatSource('github_remote')).toBe('GitHub'));
});

describe('timeAgo', () => {
  it('returns "Just now" for recent', () => expect(timeAgo(new Date().toISOString())).toBe('Just now'));
  it('returns "Never" for null', () => expect(timeAgo(null)).toBe('Never'));
  it('returns "Unknown" for invalid', () => expect(timeAgo('bad-date')).toBe('Unknown'));
  it('returns minutes ago', () => {
    const val = timeAgo(new Date(Date.now() - 10 * 60 * 1000).toISOString());
    expect(val).toMatch(/10m ago/);
  });
  it('returns hours ago', () => {
    const val = timeAgo(new Date(Date.now() - 5 * 3600 * 1000).toISOString());
    expect(val).toMatch(/5h ago/);
  });
  it('returns days ago', () => {
    const val = timeAgo(new Date(Date.now() - 3 * 86400000).toISOString());
    expect(val).toMatch(/3d ago/);
  });
});
