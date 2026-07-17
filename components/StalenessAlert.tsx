'use client';

import type { StalenessInfo } from '@/types/metrics';

interface Props {
  staleness: StalenessInfo;
  repoName: string;
}

export default function StalenessAlert({ staleness, repoName }: Props) {
  if (staleness.risk === 'low') return null;

  const icon = { moderate: '⚠️', high: '🔶', critical: '🔴' }[staleness.risk] ?? '⚠️';

  return (
    <div
      className={`staleness-alert staleness-${staleness.risk}`}
      role="alert"
    >
      <span className="staleness-icon">{icon}</span>
      <div className="staleness-body">
        <strong className="staleness-name">{repoName}</strong>
        <p className="staleness-message">{staleness.message}</p>
        {staleness.days_until_dead > 0 && staleness.risk === 'high' && (
          <p className="staleness-countdown">
            ⏳ Going dead in {staleness.days_until_dead} day{staleness.days_until_dead !== 1 ? 's' : ''} if no action.
          </p>
        )}
      </div>
    </div>
  );
}
