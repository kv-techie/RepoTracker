'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { TrackedRepo } from '@/types/repo';
import { timeAgo } from '@/lib/resolver';
import HybridSourceBadge from './HybridSourceBadge';
import Icon from './Icon';
import type { Collection } from '@/lib/collections';

interface Props {
  repo: TrackedRepo;
  isDeployed?: boolean;
  onDeployToggle?: (id: string, deployed: boolean) => void;
  collections?: Collection[];
  collectionId?: string | null;
  onCollectionAssign?: (id: string, collectionId: string | null) => void;
}

const RISK_LABEL: Record<string, string> = {
  low: 'Healthy',
  moderate: 'Watch',
  high: 'Stale',
  critical: 'At risk',
};

export default function RepoListItem({
  repo,
  isDeployed = false,
  onDeployToggle,
  collections = [],
  collectionId = null,
  onCollectionAssign,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const activeCollection = collections.find(c => c.id === collectionId) ?? null;
  const health = repo.health?.score ?? null;
  const risk = repo.staleness?.risk;
  const uncommitted = repo.sync?.uncommitted_changes ?? 0;
  const ahead = repo.sync?.local_ahead_by ?? 0;

  return (
    <article className={`repo-row${isDeployed ? ' repo-row--deployed' : ''}`}>
      <div className="repo-row-main">
        <div className="repo-title-row">
          <Link href={`/repos/${repo.id}`} className="repo-name-link">
            {repo.name}
          </Link>
          {repo.is_private && <span className="repo-chip">Private</span>}
          {isDeployed && <span className="repo-chip repo-chip--solid">Deployed</span>}
          {activeCollection && (
            <span className="repo-chip repo-chip--collection">
              <span className="col-dot" style={{ background: activeCollection.color }} />
              {activeCollection.name}
            </span>
          )}
        </div>

        {repo.description && <p className="repo-row-desc">{repo.description}</p>}

        <div className="repo-row-meta">
          {repo.language && (
            <span className="meta-item">
              <span className="lang-dot" />
              {repo.language}
            </span>
          )}
          <span className="meta-item" title="Freshest activity across filesystem, local git and GitHub">
            <Icon name="clock" size={13} />
            {repo.latest_activity_at ? timeAgo(repo.latest_activity_at) : 'no activity'}
          </span>
          {repo.last_remote_push_at && (
            <span className="meta-item" title={`Last pushed to GitHub: ${new Date(repo.last_remote_push_at).toLocaleString()}`}>
              <Icon name="globe" size={13} />
              {timeAgo(repo.last_remote_push_at)}
            </span>
          )}
          {ahead > 0 && (
            <span className="meta-item meta-item--attention" title={`${ahead} commit(s) not pushed`}>
              <Icon name="arrow-up" size={13} />
              {ahead} unpushed
            </span>
          )}
          {uncommitted > 0 && (
            <span className="meta-item meta-item--attention" title={`${uncommitted} uncommitted file(s)`}>
              <Icon name="activity" size={13} />
              {uncommitted} uncommitted
            </span>
          )}
          <HybridSourceBadge source={repo.latest_source} compact />
        </div>
      </div>

      <div className="repo-row-side">
        {health !== null && (
          <div className={`repo-health repo-health--${repo.health?.level ?? 'fair'}`} title={repo.health?.breakdown.reasons.join(' · ')}>
            <span className="repo-health-value">{health}</span>
            <span className="repo-health-label">health</span>
          </div>
        )}
        {risk && !isDeployed && (
          <span className={`repo-risk repo-risk--${risk}`}>{RISK_LABEL[risk] ?? risk}</span>
        )}

        <div className="repo-menu" ref={menuRef}>
          <button
            className="icon-btn"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={`Actions for ${repo.name}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Icon name="more" size={18} />
          </button>

          {menuOpen && (
            <div className="repo-action-menu" role="menu">
              <button
                className="repo-action-item"
                role="menuitem"
                onClick={() => {
                  onDeployToggle?.(repo.id, !isDeployed);
                  setMenuOpen(false);
                }}
              >
                <Icon name="globe" size={15} />
                {isDeployed ? 'Unmark as deployed' : 'Mark as deployed'}
              </button>

              {onCollectionAssign && collections.length > 0 && (
                <>
                  <div className="repo-action-divider" />
                  <label className="repo-action-label" htmlFor={`collection-select-${repo.id}`}>
                    Collection
                  </label>
                  <select
                    id={`collection-select-${repo.id}`}
                    className="repo-action-select"
                    value={collectionId ?? ''}
                    onChange={e => {
                      onCollectionAssign(repo.id, e.target.value || null);
                      setMenuOpen(false);
                    }}
                  >
                    <option value="">No collection</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="repo-action-divider" />
              <Link
                href={`/repos/${repo.id}`}
                className="repo-action-item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <Icon name="search" size={15} />
                View details
              </Link>
              {repo.remote_url && (
                <a
                  href={repo.remote_url.replace(/\.git$/, '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-action-item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon name="external" size={15} />
                  Open on GitHub
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
