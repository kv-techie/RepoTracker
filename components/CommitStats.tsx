'use client';

import { CommitStats } from '@/types/commit';

interface CommitStatsProps {
  stats: CommitStats;
}

export default function CommitStatsComponent({ stats }: CommitStatsProps) {
  return (
    <div className="commit-stats">
      <div className="stat-card">
        <div className="stat-label">Total Commits</div>
        <div className="stat-value">{stats.totalCommits}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">This Month</div>
        <div className="stat-value">{stats.commitsThisMonth}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">This Week</div>
        <div className="stat-value">{stats.commitsThisWeek}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Avg/Day</div>
        <div className="stat-value">
          {stats.averageCommitsPerDay.toFixed(2)}
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-label">Top Committer</div>
        <div className="stat-value-small">{stats.topCommitter}</div>
      </div>
    </div>
  );
}
