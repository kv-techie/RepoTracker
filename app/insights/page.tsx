'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';

import type { Commit } from '@/types/repo';
import CommitHeatmap from '@/components/CommitHeatmap';
import LocalModeBanner from '@/components/LocalModeBanner';
import Icon from '@/components/Icon';
import { computeStreak, dedupeCommits } from '@/lib/commitDates';
import { githubSlug } from '@/lib/utils';
import { getCommitTimes, getWeeklySummary } from '@/lib/agent';

// Format token counts dynamically: raw for <1k, "k" for thousands, "M" for millions
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}

// Coding time pattern analysis — scoped to a specific year

function analyzeCodingPatterns(commits: Commit[], year: number) {
  const filtered = commits.filter(c => new Date(c.committed_at).getFullYear() === year);
  const hourCounts = Array(24).fill(0);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCounts = Array(7).fill(0);

  for (const c of filtered) {
    const d = new Date(c.committed_at);
    hourCounts[d.getHours()]++;
    dayCounts[d.getDay()]++;
  }

  const totalCommits = filtered.length;
  const peakHour = totalCommits ? hourCounts.indexOf(Math.max(...hourCounts)) : null;
  const peakDay = totalCommits ? dayCounts.indexOf(Math.max(...dayCounts)) : null;

  const nightOwl =
    hourCounts.slice(20, 24).reduce((a, b) => a + b, 0) +
    hourCounts.slice(0, 4).reduce((a, b) => a + b, 0);
  const nightPct = totalCommits ? Math.round((nightOwl / totalCommits) * 100) : 0;

  const weekendCommits = dayCounts[0] + dayCounts[6];
  const weekendPct = totalCommits ? Math.round((weekendCommits / totalCommits) * 100) : 0;

  return { hourCounts, dayCounts, dayNames, peakHour, peakDay, nightPct, weekendPct, totalCommits };
}

function WeeklySummaryCard() {
  const [summary, setSummary] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'empty'>('idle');

  const generate = async () => {
    setState('loading');
    const res = await getWeeklySummary();
    const text = res.summary?.trim() ?? '';
    setSummary(text);
    setState(text ? 'idle' : 'empty');
  };

  return (
    <section className="insight-section">
      <h2 className="section-title">Weekly summary</h2>
      <div className="weekly-summary">
        {summary && <p className="weekly-summary-text">{summary}</p>}
        {state === 'empty' && (
          <p className="weekly-summary-text weekly-summary-text--muted">
            No summary available. Check the AI provider in Settings.
          </p>
        )}
        <button className="btn-secondary" onClick={generate} disabled={state === 'loading'}>
          {state === 'loading' ? 'Generating…' : summary ? 'Regenerate' : 'Generate summary'}
        </button>
        <p className="settings-hint">
          Written from your real metrics by the local or cloud model. Runs only when you ask, to save tokens.
        </p>
      </div>
    </section>
  );
}

export default function InsightsPage() {
  const { status } = useSession();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (status === 'loading') return;

    async function loadCommits() {
      const allCommits: Commit[] = [];
      const allRepos: any[] = [];

      const withTimeout = async (url: string): Promise<Response | null> => {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        try { return await fetch(url, { signal: ac.signal }); }
        catch { return null; }
        finally { clearTimeout(t); }
      };
      const localSlugs = new Set<string>();

      // 1. Local agent: every stored commit across all repos, already de-duplicated by SHA
      try {
        const reposRes = await withTimeout('/api/agent/repos');
        const allAgentRepos: any[] = reposRes?.ok ? await reposRes.json() : [];
        // Repos tagged `missing` are no longer on disk; their last numbers would be stale
        const agentRepos = allAgentRepos.filter(r => !(r.tags ?? []).includes('missing'));
        for (const repo of agentRepos) {
          allRepos.push({
            id: repo.id,
            name: repo.name,
            token_count: repo.file_intelligence?.total_tokens ?? null,
            file_count: repo.file_intelligence?.context_file_count ?? 0,
          });
          const s = githubSlug(repo.remote_url);
          if (s) localSlugs.add(s);
        }
        // The agent returns de-duplicated timestamps; sha is only needed to merge GitHub rows
        const times = await getCommitTimes();
        allCommits.push(...times.map((committed_at, i) => ({
          sha: `local-${i}`, message: '', author: '', committed_at,
          files_changed: 0, insertions: 0, deletions: 0, repo_id: 'local',
        } as Commit)));
      } catch { /* agent offline */ }

      // 2. GitHub: only repos the agent does not already track, so pushed commits are not counted twice
      try {
        const ghRes = await withTimeout('/api/github/repos');
        const ghAll: any[] = ghRes?.ok ? await ghRes.json() : [];
        const ghRepos = (Array.isArray(ghAll) ? ghAll : [])
          .filter(repo => repo?.name && !localSlugs.has(String(repo.full_name ?? '').toLowerCase()));
        // GitHub's `size` is the packed repository (history and binaries), not source text,
        // so it cannot stand in for context size. These repos are listed without an estimate.
        for (const repo of ghRepos) {
          allRepos.push({ id: `gh-${repo.id}`, name: repo.name, token_count: null });
        }
        const commitResults = await Promise.all(
          ghRepos.map(async (repo: any) => {
            // Ask for the repo's own default branch (main, master, ...); empty lets GitHub decide
            const res = await withTimeout(`/api/github/commits?owner=${repo.owner?.login ?? ''}&repo=${repo.name}&branch=${encodeURIComponent(repo.default_branch ?? '')}`);
            if (!res?.ok) return [];
            const data: any[] = await res.json();
            return data.filter(c => c?.sha).map(c => ({
              sha: c.sha,
              message: c.commit?.message?.split('\n')[0] ?? '',
              author: c.commit?.author?.name ?? '',
              committed_at: c.commit?.author?.date ?? '',
              files_changed: 0,
              insertions: 0,
              deletions: 0,
              repo_id: `gh-${repo.id}`,
            } as Commit));
          })
        );
        allCommits.push(...commitResults.flat());
      } catch { /* GitHub offline */ }

      setRepos(allRepos.sort((a, b) => (b.token_count ?? -1) - (a.token_count ?? -1)));
      setCommits(
        dedupeCommits(allCommits)
          .filter(c => c.committed_at)
          .sort((a, b) => b.committed_at.localeCompare(a.committed_at))
      );
      setIsLoading(false);
    }

    loadCommits();
  }, [status]);

  // Memoize so chart rerenders only when year or commits change
  const patterns = useMemo(() => analyzeCodingPatterns(commits, selectedYear), [commits, selectedYear]);
  const streak = useMemo(() => computeStreak(commits), [commits]);
  const measuredRepos = repos.filter(r => typeof r.token_count === 'number');
  const unmeasuredRepos = repos.filter(r => typeof r.token_count !== 'number');

  if (isLoading) return <div className="dashboard-loading"><div className="loading-spinner" /></div>;

  return (
    <div className="insights-page">
      <LocalModeBanner />
      <header className="page-header">
        <div>
          <h1 className="page-title">Commit intelligence</h1>
          <p className="page-sub">Patterns across every repository the agent tracks</p>
        </div>
      </header>

      {/* Streak + stats cards — always all-time */}
      <div className="insight-stat-grid">
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="flame" size={13} /> Day streak</span>
          <span className="insight-stat-value">{streak.current}</span>
          <span className="insight-stat-note">consecutive days with a commit</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="trophy" size={13} /> Longest streak</span>
          <span className="insight-stat-value">{streak.longest}</span>
          <span className="insight-stat-note">all time</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="moon" size={13} /> Night owl</span>
          <span className="insight-stat-value">{patterns.nightPct}%</span>
          <span className="insight-stat-note">commits between 8pm and 4am</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="calendar" size={13} /> Weekend work</span>
          <span className="insight-stat-value">{patterns.weekendPct}%</span>
          <span className="insight-stat-note">commits on Saturday or Sunday</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="sun" size={13} /> Peak hour</span>
          <span className="insight-stat-value">
            {patterns.peakHour !== null ? `${String(patterns.peakHour).padStart(2, '0')}:00` : '—'}
          </span>
          <span className="insight-stat-note">busiest hour in {selectedYear}</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-head"><Icon name="activity" size={13} /> Busiest day</span>
          <span className="insight-stat-value">
            {patterns.peakDay !== null ? patterns.dayNames[patterns.peakDay] : '—'}
          </span>
          <span className="insight-stat-note">{patterns.totalCommits} commits in {selectedYear}</span>
        </div>
      </div>

      {/* Heatmap — year selector lives inside CommitHeatmap */}
      <section className="insight-section">
        <CommitHeatmap
          commits={commits}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
        />
      </section>

      {/* Hourly distribution — filtered by selectedYear */}
      <section className="insight-section">
        <h2 className="section-title">
          Commits by hour
          <span className="chart-year-badge">{selectedYear}</span>
          <span className="section-note">peak {Math.max(...patterns.hourCounts, 0)} commits</span>
        </h2>
        <div className="hour-chart" role="img" aria-label={`Commits by hour — ${selectedYear}`}>
          {patterns.hourCounts.map((count, hour) => {
            const max = Math.max(...patterns.hourCounts, 1);
            const pct = (count / max) * 100;
            return (
              <div key={hour} className="hour-bar-wrap" title={`${hour}:00 — ${count} commits`}>
                <div className="hour-bar" style={{ height: `${pct}%` }} />
                {hour % 6 === 0 && <span className="hour-label">{hour}h</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Day distribution — filtered by selectedYear */}
      <section className="insight-section">
        <h2 className="section-title">
          Commits by day of week
          <span className="chart-year-badge">{selectedYear}</span>
          <span className="section-note">peak {Math.max(...patterns.dayCounts, 0)} commits</span>
        </h2>
        <div className="day-chart">
          {patterns.dayNames.map((day, i) => {
            const max = Math.max(...patterns.dayCounts, 1);
            const pct = (patterns.dayCounts[i] / max) * 100;
            return (
              <div key={day} className="day-bar-wrap">
                <span className="day-count">{patterns.dayCounts[i]}</span>
                <div className="day-bar" style={{ height: `${pct}%` }} />
                <span className="day-label">{day}</span>
              </div>
            );
          })}
        </div>
      </section>

      <WeeklySummaryCard />

      {/* AI Token Footprint */}
      <section className="insight-section">
        <h2 className="section-title">
          Codebase context size
          <span className="section-note">
            approximate: tracked source files ÷ 3.7 characters per token, no lockfiles or build output
          </span>
        </h2>
        <div className="token-grid">
          {measuredRepos.map(repo => (
            <div key={repo.id} className="token-card">
              <span className="token-repo-name">{repo.name}</span>
              <span className="token-count-value">~{formatTokens(repo.token_count)}</span>
              <span className="token-source">{repo.file_count} files counted</span>
            </div>
          ))}
        </div>
        {unmeasuredRepos.length > 0 && (
          <p className="settings-hint token-footnote">
            {unmeasuredRepos.length} GitHub repo{unmeasuredRepos.length !== 1 ? 's are' : ' is'} not measured:
            context size needs a local clone the agent can read.
          </p>
        )}
      </section>
    </div>
  );
}
