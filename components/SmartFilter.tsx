'use client';

import type { FilterTag } from '@/types/repo';

const FILTERS: Array<{ tag: FilterTag | 'all'; label: string; icon: string }> = [
  { tag: 'all', label: 'All', icon: '⬡' },
  { tag: 'active', label: 'Active', icon: '🟢' },
  { tag: 'stale', label: 'Stale', icon: '🟡' },
  { tag: 'unpushed', label: 'Unpushed', icon: '⬆' },
  { tag: 'local_only', label: 'Local Only', icon: '💾' },
  { tag: 'broken', label: 'Broken', icon: '🔴' },
  { tag: 'deployed', label: 'Deployed', icon: '🚀' },
];

interface Props {
  active: FilterTag | 'all';
  counts?: Partial<Record<FilterTag | 'all', number>>;
  onChange: (tag: FilterTag | 'all') => void;
}

export default function SmartFilter({ active, counts = {}, onChange }: Props) {
  return (
    <div className="smart-filter" role="tablist" aria-label="Repository filters">
      {FILTERS.map(f => (
        <button
          key={f.tag}
          role="tab"
          aria-selected={active === f.tag}
          className={`filter-tab ${active === f.tag ? 'filter-tab--active' : ''}`}
          onClick={() => onChange(f.tag as FilterTag | 'all')}
          id={`filter-${f.tag}`}
        >
          <span className="filter-icon">{f.icon}</span>
          <span className="filter-label">{f.label}</span>
          {counts[f.tag] !== undefined && (
            <span className="filter-count">{counts[f.tag]}</span>
          )}
        </button>
      ))}
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
