'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { TrackedRepo } from '@/types/repo';
import { timeAgo } from '@/lib/resolver';
import HybridSourceBadge from './HybridSourceBadge';

interface Props {
  repo: TrackedRepo;
  isDeployed?: boolean;
  onDeployToggle?: (id: string, deployed: boolean) => void;
}

export default function RepoListItem({ repo, isDeployed = false, onDeployToggle }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const sparklinePoints = '0,10 5,8 10,12 15,4 20,9 25,2 30,8 35,0 40,6 45,1';

  return (
    <article className={`repo-list-item${isDeployed ? ' repo-list-item--deployed' : ''}`}>
      <div className="repo-list-main">
        <div className="repo-title-row">
          <Link href={`/repos/${repo.id}`} className="repo-name-link">
            {repo.name}
          </Link>
          <span className="repo-visibility-badge">
            {repo.is_private ? 'Private' : 'Public'}
          </span>
          {isDeployed && (
            <span className="repo-deployed-chip" title="Marked as deployed — excluded from stale alerts">
              🚀 Deployed
            </span>
          )}
        </div>

        {repo.description && (
          <p className="repo-list-desc">{repo.description}</p>
        )}

        <div className="repo-list-meta">
          {repo.language && (
            <span className="repo-list-lang">
              <span className="lang-dot"></span>
              {repo.language}
            </span>
          )}
          <span className="repo-list-updated">
            Updated {repo.latest_activity_at ? timeAgo(repo.latest_activity_at) : 'never'}
          </span>
          {repo.last_remote_push_at && (
            <span className="repo-list-github-push" title={`Last pushed to GitHub: ${new Date(repo.last_remote_push_at).toLocaleString()}`}>
              ☁️ {timeAgo(repo.last_remote_push_at)}
            </span>
          )}
          <HybridSourceBadge source={repo.latest_source} compact />
        </div>
      </div>

      <div className="repo-list-side">
        <div className="repo-star-group" ref={menuRef}>
          <button className="btn-star">☆ Star</button>
          <button
            className="btn-star-drop"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Repo options"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            ▼
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
                {isDeployed ? (
                  <><span>📦</span> Unmark as Deployed</>
                ) : (
                  <><span>🚀</span> Mark as Deployed</>
                )}
              </button>
              <div className="repo-action-divider" />
              <Link
                href={`/repos/${repo.id}`}
                className="repo-action-item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <span>🔍</span> View Details
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
                  <span>↗</span> Open on GitHub
                </a>
              )}
            </div>
          )}
        </div>

        <div className="repo-sparkline">
          <svg viewBox="0 0 45 15" className="sparkline-svg">
            <polyline
              fill="none"
              stroke="var(--success)"
              strokeWidth="1.5"
              points={sparklinePoints}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </article>
  );
}
