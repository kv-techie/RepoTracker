'use client';

import type { FilterTag } from '@/types/repo';
import Icon, { type IconName } from './Icon';

const FILTERS: Array<{ tag: FilterTag | 'all'; label: string; icon: IconName }> = [
  { tag: 'all', label: 'All', icon: 'grid' },
  { tag: 'active', label: 'Active', icon: 'activity' },
  { tag: 'stale', label: 'Stale', icon: 'clock' },
  { tag: 'unpushed', label: 'Unpushed', icon: 'arrow-up' },
  { tag: 'local_only', label: 'Local only', icon: 'drive' },
  { tag: 'broken', label: 'Broken', icon: 'alert' },
  { tag: 'deployed', label: 'Deployed', icon: 'globe' },
  { tag: 'missing', label: 'Missing', icon: 'circle-slash' },
];

interface Props {
  active: FilterTag | 'all';
  counts?: Partial<Record<FilterTag | 'all', number>>;
  onChange: (tag: FilterTag | 'all') => void;
}

export default function SmartFilter({ active, counts = {}, onChange }: Props) {
  // With counts supplied, only offer states some repo is actually in
  const hasCounts = Object.keys(counts).length > 0;

  return (
    <div className="smart-filter" role="tablist" aria-label="Repository filters">
      {FILTERS.map(f => {
        const count = counts[f.tag];
        if (hasCounts && !count && f.tag !== active) return null;
        return (
          <button
            key={f.tag}
            role="tab"
            aria-selected={active === f.tag}
            className={`filter-tab ${active === f.tag ? 'filter-tab--active' : ''}`}
            onClick={() => onChange(f.tag as FilterTag | 'all')}
            id={`filter-${f.tag}`}
          >
            <Icon name={f.icon} size={14} className="filter-icon" />
            <span className="filter-label">{f.label}</span>
            {count !== undefined && <span className="filter-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Build counts map from a list of repos. */
export function buildFilterCounts(repos: Array<{ tags: FilterTag[] }>): Record<FilterTag | 'all', number> {
  const counts: Record<string, number> = { all: repos.length };
  for (const repo of repos) {
    for (const tag of repo.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts as Record<FilterTag | 'all', number>;
}
