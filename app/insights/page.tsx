'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import type { Commit } from '@/types/repo';
import CommitHeatmap from '@/components/CommitHeatmap';

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

// Streak computed from ALL commits (not year-filtered — a streak is today-relative)
function computeStreak(commits: Commit[]): { current: number; longest: number } {
  if (!commits.length) return { current: 0, longest: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const days = [...new Set(commits.map(c => c.committed_at.slice(0, 10)))].sort().reverse();

  let current = 0;
  let longest = 0;
  let streak = 0;
  let prev: string | null = null;

  for (const day of days) {
    if (!prev) {
      streak = day === today || day === yesterday ? 1 : 0;
      current = streak;
    } else {
      const diff = (new Date(prev).getTime() - new Date(day).getTime()) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    }
    if (streak > longest) longest = streak;
    prev = day;
  }
  return { current, longest };
}

export default function InsightsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function loadCommits() {
      const allCommits: Commit[] = [];
      const allRepos: any[] = [];

      // 1. Local agent commits
      try {
        const agentRepos = await fetch('/api/agent/repos').then(r => r.ok ? r.json() : []);
        for (const repo of agentRepos) {
          allRepos.push({
            id: repo.id,
            name: repo.name,
            token_count: repo.file_intelligence?.total_tokens || 0,
          });
        }
        for (const repo of (agentRepos as any[]).slice(0, 10)) {
          const res = await fetch(`/api/agent/repos/${repo.id}/commits`).catch(() => null);
          if (res?.ok) allCommits.push(...(await res.json() as Commit[]));
        }
      } catch { /* agent offline */ }

      // 2. GitHub API commits
      try {
        const ghRepos: any[] = await fetch('/api/github/repos').then(r => r.ok ? r.json() : []);
        for (const repo of ghRepos) {
          if (!allRepos.find(r => r.name === repo.name)) {
            allRepos.push({
              id: `gh-${repo.id}`,
              name: repo.name,
              token_count: repo.size ? Math.floor((repo.size * 1024) / 4) : 0,
            });
          }
        }
        for (const repo of ghRepos.slice(0, 10)) {
          if (!repo?.name || repo.error) continue;
          const url = `/api/github/commits?owner=${repo.owner?.login ?? ''}&repo=${repo.name}`;
          const res = await fetch(url).catch(() => null);
          if (res?.ok) {
            const data: any[] = await res.json();
            for (const c of data) {
              if (!c?.sha) continue;
              allCommits.push({
                sha: c.sha,
                message: c.commit?.message?.split('\n')[0] ?? '',
                author: c.commit?.author?.name ?? '',
                committed_at: c.commit?.author?.date ?? '',
                files_changed: 0,
                insertions: 0,
                deletions: 0,
                repo_id: `gh-${repo.id}`,
              });
            }
          }
        }
      } catch { /* GitHub offline */ }

      setRepos(allRepos.sort((a, b) => b.token_count - a.token_count));
      setCommits(
        allCommits
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

  if (isLoading) return <div className="dashboard-loading"><div className="loading-spinner" /></div>;

  return (
    <div className="insights-page">
      <div className="page-header">
        <h1 className="page-title">Commit Intelligence</h1>
        <p className="page-sub">Patterns across all your repositories</p>
      </div>

      {/* Streak + stats cards — always all-time */}
      <div className="insight-stat-grid">
        <div className="insight-stat-card">
          <span className="insight-stat-icon">🔥</span>
          <span className="insight-stat-value">{streak.current}</span>
          <span className="insight-stat-label">Day streak</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-icon">🏆</span>
          <span className="insight-stat-value">{streak.longest}</span>
          <span className="insight-stat-label">Longest streak</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-icon">🌙</span>
          <span className="insight-stat-value">{patterns.nightPct}%</span>
          <span className="insight-stat-label">Night owl commits</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-icon">📅</span>
          <span className="insight-stat-value">{patterns.weekendPct}%</span>
          <span className="insight-stat-label">Weekend warrior</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-icon">⏰</span>
          <span className="insight-stat-value">
            {patterns.peakHour !== null ? `${patterns.peakHour}:00` : '—'}
          </span>
          <span className="insight-stat-label">Peak coding hour</span>
        </div>
        <div className="insight-stat-card">
          <span className="insight-stat-icon">📆</span>
          <span className="insight-stat-value">
            {patterns.peakDay !== null ? patterns.dayNames[patterns.peakDay] : '—'}
          </span>
          <span className="insight-stat-label">Most active day</span>
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
          Commits by Hour
          <span className="chart-year-badge">{selectedYear}</span>
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
          Commits by Day of Week
          <span className="chart-year-badge">{selectedYear}</span>
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

      {/* AI Token Footprint */}
      <section className="insight-section">
        <h2 className="section-title">AI Token Footprint (Codebase Context Size)</h2>
        <div className="token-grid">
          {repos.map(repo => (
            <div key={repo.id} className="token-card">
              <span className="token-repo-name">{repo.name}</span>
              <span className="token-count-value">~{(repo.token_count / 1000).toFixed(1)}k tokens</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
