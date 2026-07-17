/**
 * Client-side Hybrid Source Resolver.
 * Mirrors agent/resolver.py logic for offline/SSR use.
 * Rules §3: local always wins on ties.
 */

import type { LatestSource } from '@/types/repo';

export interface ResolverInput {
  file_mtime?: string | null;
  local_commit_time?: string | null;
  remote_push_time?: string | null;
}

export interface ResolverResult {
  source: LatestSource;
  timestamp: Date | null;
}

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function resolveLatestSource(input: ResolverInput): ResolverResult {
  const candidates: Array<{ source: LatestSource; ts: Date | null }> = [
    { source: 'local_filesystem', ts: parseDate(input.file_mtime) },
    { source: 'local_git', ts: parseDate(input.local_commit_time) },
    { source: 'github_remote', ts: parseDate(input.remote_push_time) },
  ];

  const valid = candidates.filter(c => c.ts !== null) as Array<{
    source: LatestSource;
    ts: Date;
  }>;

  if (!valid.length) return { source: 'github_remote', timestamp: null };

  // Max by timestamp; first entry wins on tie (local priority)
  const best = valid.reduce((a, b) => (b.ts > a.ts ? b : a));
  return { source: best.source, timestamp: best.ts };
}

/** Format a source name for display. */
export function formatSource(source: LatestSource): string {
  const map: Record<LatestSource, string> = {
    local_filesystem: 'Local Files',
    local_git: 'Local Git',
    github_remote: 'GitHub',
  };
  return map[source] ?? source;
}

/** Returns relative time string like "3 days ago". */
export function timeAgo(isoString?: string | null): string {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Unknown';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 604800)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
