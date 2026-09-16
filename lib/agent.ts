/**
 * Typed client for the local RepoTracker Agent.
 * All calls gracefully degrade when the agent is offline.
 */

import type { TrackedRepo, FilterTag } from '@/types/repo';
import type { AgentStatus, AgentConfig, AgentConfigUpdate, AiQueryResponse, WeeklySummaryResponse } from '@/types/agent';
import { githubSlug } from '@/lib/utils';

const BASE = '/api/agent';

async function safeFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const data = await safeFetch<AgentStatus>(`${BASE}/status`);
  return data ?? { online: false, version: '—', watching_folder_count: 0, repo_count: 0, ai_enabled: false };
}

export async function getLocalRepos(tag?: string, collection?: string): Promise<TrackedRepo[]> {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  if (collection) params.set('collection', collection);
  return (await safeFetch<TrackedRepo[]>(`${BASE}/repos?${params}`)) ?? [];
}

export async function updateRepoUserState(
  repoId: string,
  update: { collection?: string | null; deployed?: boolean },
): Promise<TrackedRepo | null> {
  const body: Record<string, unknown> = {};
  if (update.collection === null) body.clear_collection = true;
  else if (update.collection !== undefined) body.collection = update.collection;
  if (update.deployed !== undefined) body.deployed = update.deployed;

  return safeFetch<TrackedRepo>(`${BASE}/repos/${repoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function triggerScan(): Promise<{ message: string } | null> {
  return safeFetch(`${BASE}/scan`, { method: 'POST' });
}

export async function getAgentConfig(): Promise<AgentConfig | null> {
  return safeFetch<AgentConfig>(`${BASE}/config`);
}

export async function updateAgentConfig(updates: AgentConfigUpdate): Promise<AgentConfig | null> {
  return safeFetch<AgentConfig>(`${BASE}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function getWeeklySummary(): Promise<WeeklySummaryResponse> {
  return (await safeFetch<WeeklySummaryResponse>(`${BASE}/ai/summary`)) ??
    { summary: '', ai_enabled: false };
}

/** Commit timestamps across every tracked repo, de-duplicated by the agent. */
export async function getCommitTimes(years?: number): Promise<string[]> {
  const query = years ? `?years=${years}` : '';
  const data = await safeFetch<{ commits: string[] }>(`${BASE}/insights/commits${query}`);
  return data?.commits ?? [];
}

/** Explainable health for one repo, with history and what changed. */
export async function getRepoHealthDetail(repoId: string) {
  return safeFetch<{ changes: string[] }>(`${BASE}/health/${repoId}`);
}

export async function askRepo(question: string): Promise<AiQueryResponse> {
  return (await safeFetch<AiQueryResponse>(`${BASE}/ai/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })) ?? { answer: 'Agent is offline.' };
}

const STALE_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const ACTIVE_MS = 60 * 24 * 60 * 60 * 1000;  // 60 days (matches low+moderate staleness risk)

/**
 * Compute Active/Stale tags from a timestamp for repos without local scanner data.
 * NOTE: "broken" tag is never assigned here — it requires git-level inspection
 * from the Python scanner (e.g. detached HEAD, corrupted .git).
 */
function computeTags(activityAt: string | undefined): FilterTag[] {
  if (!activityAt) return [];
  const age = Date.now() - new Date(activityAt).getTime();
  const tags: FilterTag[] = [];
  if (age < ACTIVE_MS) tags.push('active');
  if (age > STALE_MS)  tags.push('stale');
  return tags;
}

export async function getHybridRepos(): Promise<TrackedRepo[]> {
  const [localRepos, githubReposRaw] = await Promise.all([
    getLocalRepos(),
    safeFetch<any[]>('/api/github/repos'),
  ]);

  const merged: TrackedRepo[] = [...localRepos];

  if (Array.isArray(githubReposRaw)) {
    for (const gh of githubReposRaw) {
      // Match on owner/repo only: bare names collide, and SSH vs HTTPS remotes never compare equal
      const ghSlug = String(gh.full_name ?? '').toLowerCase();
      const existing = merged.find(r => githubSlug(r.remote_url) === ghSlug);
      if (existing) {
        // Enrich locally-tracked repo with GitHub metadata
        existing.github_stars = gh.stargazers_count;
        existing.github_forks = gh.forks_count;
        existing.description  = existing.description || gh.description;
        existing.language     = existing.language     || gh.language;
        existing.source_type  = 'hybrid';
        // Always store the GitHub push timestamp so the detail page can show it
        if (gh.pushed_at) {
          existing.last_remote_push_at = gh.pushed_at;
        }
        if (gh.pushed_at && (!existing.latest_activity_at || new Date(gh.pushed_at) > new Date(existing.latest_activity_at))) {
          existing.latest_activity_at = gh.pushed_at;
          existing.latest_source = 'github_remote';
        }
      } else {
        // Pure GitHub repo — add it with computed tags
        const activityAt = gh.pushed_at || gh.updated_at;
        const tags = computeTags(activityAt);
        merged.push({
          id: `gh-${gh.id}`,
          name: gh.name,
          remote_url: gh.clone_url,
          source_type: 'github',
          latest_source: 'github_remote',
          current_branch: gh.default_branch,
          default_branch: gh.default_branch,
          is_private: gh.private,
          description: gh.description ?? '',
          language: gh.language ?? '',
          topics: gh.topics || [],
          latest_activity_at: activityAt,
          last_remote_push_at: gh.pushed_at,
          sync: { local_ahead_by: 0, remote_ahead_by: 0, is_diverged: false, uncommitted_changes: 0, has_stash: false },
          github_stars: gh.stargazers_count,
          github_forks: gh.forks_count,
          tags,
          created_at: gh.created_at,
          updated_at: gh.updated_at,
        } as TrackedRepo);
      }
    }
  }

  // For any local repo that the Python scanner hasn't tagged yet, compute client-side
  for (const repo of merged) {
    if (repo.tags.length === 0) {
      repo.tags = computeTags(repo.latest_activity_at);
    }
  }

  return merged.sort((a, b) => {
    const tA = a.latest_activity_at ? new Date(a.latest_activity_at).getTime() : 0;
    const tB = b.latest_activity_at ? new Date(b.latest_activity_at).getTime() : 0;
    return tB - tA;
  });
}
