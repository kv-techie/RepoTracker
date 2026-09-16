'use client';

import Link from 'next/link';
import type { TrackedRepo } from '@/types/repo';
import Icon from './Icon';

interface Props {
  repos: TrackedRepo[];
}

/**
 * One compact line for everything at risk, instead of a card per repo.
 * The dashboard already lists each repo; this is the "what needs attention" summary.
 */
export default function StalenessAlert({ repos }: Props) {
  if (repos.length === 0) return null;

  const critical = repos.filter(r => r.staleness?.risk === 'critical');
  const worst = [...repos].sort(
    (a, b) => (b.staleness?.days_since_activity ?? 0) - (a.staleness?.days_since_activity ?? 0),
  );
  const shown = worst.slice(0, 3);

  return (
    <div
      className={`attention-bar${critical.length ? ' attention-bar--critical' : ''}`}
      role="status"
      aria-label="Repositories that need attention"
    >
      <Icon name="alert" size={16} />
      <p className="attention-text">
        <strong>{repos.length} repo{repos.length !== 1 ? 's' : ''}</strong> need attention
        {critical.length > 0 && ` · ${critical.length} may be abandoned`}
      </p>
      <ul className="attention-list">
        {shown.map(repo => (
          <li key={repo.id}>
            <Link href={`/repos/${repo.id}`} className="attention-link">
              {repo.name}
              <span className="attention-days">{repo.staleness?.days_since_activity}d</span>
            </Link>
          </li>
        ))}
        {repos.length > shown.length && (
          <li className="attention-more">+{repos.length - shown.length} more</li>
        )}
      </ul>
    </div>
  );
}
