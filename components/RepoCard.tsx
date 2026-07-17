'use client';

import Link from 'next/link';
import type { TrackedRepo } from '@/types/repo';
import { timeAgo } from '@/lib/resolver';
import HealthRing from './HealthRing';
import HybridSourceBadge from './HybridSourceBadge';
import SyncStatus from './SyncStatus';
import MomentumBadge from './MomentumBadge';

interface Props {
  repo: TrackedRepo;
}

export default function RepoCard({ repo }: Props) {
  const healthLevel = repo.health?.level ?? 'fair';

  return (
    <Link href={`/repos/${repo.id}`} className="repo-card-link">
      <article className={`repo-card repo-card--${healthLevel}`}>
        {/* Header */}
        <div className="repo-card-header">
          <div className="repo-card-title-row">
            <h3 className="repo-card-name">{repo.name}</h3>
            <HybridSourceBadge source={repo.latest_source} compact />
          </div>
          <HealthRing health={repo.health} size={48} />
        </div>

        {/* Description */}
        {repo.description && (
          <p className="repo-card-desc">{repo.description}</p>
        )}

        {/* Branch + Language */}
        <div className="repo-card-meta">
          <span className="repo-branch">⎇ {repo.current_branch}</span>
          {repo.language && <span className="repo-lang">{repo.language}</span>}
          <MomentumBadge momentum={repo.momentum} />
        </div>

        {/* Sync status */}
        <SyncStatus repo={repo} />

        {/* Footer */}
        <div className="repo-card-footer">
          <span className="repo-activity">
            🕐 {repo.latest_activity_at ? timeAgo(repo.latest_activity_at) : 'No activity'}
          </span>
          <div className="repo-tags">
            {repo.tags.slice(0, 3).map(tag => (
              <span key={tag} className={`tag tag--${tag}`}>{tag}</span>
            ))}
          </div>
        </div>
      </article>
    </Link>
  );
}
