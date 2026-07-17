import type { Commit } from '@/types/repo';
import type { ActivityScore } from '@/types/metrics';
import { getTimeSinceLastCommit } from './progress';

export function calculateActivityScore(commits: Commit[]): ActivityScore {
  if (commits.length === 0) {
    return { score: 0, level: 'critical', lastCommitAge: -1, frequencyTrend: 'decreasing' };
  }

  const now = new Date();
  let thirtyDayCount = 0;
  let ninetyDayCount = 0;

  commits.forEach((commit) => {
    const commitDate = new Date(commit.committed_at);
    const daysSince = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 30) thirtyDayCount++;
    if (daysSince <= 90) ninetyDayCount++;
  });

  let score = 0;
  if (thirtyDayCount > 0) score += 50;
  if (ninetyDayCount > 20) score += 30;
  if (commits.length > 100) score += 20;
  score = Math.min(score, 100);

  let level: ActivityScore['level'] = 'low';
  if (score >= 80) level = 'very-high';
  else if (score >= 60) level = 'high';
  else if (score >= 40) level = 'moderate';
  else if (score >= 20) level = 'low';
  else level = 'critical';

  const recentCommits = commits.slice(0, Math.ceil(commits.length / 3));
  const oldCommits = commits.slice(Math.ceil((commits.length * 2) / 3));
  const recentFrequency = recentCommits.length || 1;
  const oldFrequency = oldCommits.length || 1;

  let frequencyTrend: ActivityScore['frequencyTrend'] = 'stable';
  if (recentFrequency > oldFrequency * 1.2) frequencyTrend = 'increasing';
  else if (recentFrequency < oldFrequency * 0.8) frequencyTrend = 'decreasing';

  const lastCommitAge = getTimeSinceLastCommit(commits[0].committed_at);

  return { score, level, lastCommitAge, frequencyTrend };
}

export function getCommitFrequency(commits: Commit[], daysBack = 30): number {
  if (commits.length === 0) return 0;
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysBack);
  const recent = commits.filter(c => new Date(c.committed_at) > thresholdDate);
  return Math.round(recent.length / (daysBack / 7)) || 0;
}

export function getTopContributors(
  commits: Commit[],
  limit = 5
): Array<{ name: string; commits: number }> {
  const contributors: Record<string, number> = {};
  commits.forEach(commit => {
    contributors[commit.author] = (contributors[commit.author] || 0) + 1;
  });
  return Object.entries(contributors)
    .map(([name, count]) => ({ name, commits: count }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, limit);
}
