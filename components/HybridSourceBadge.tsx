'use client';

import type { LatestSource } from '@/types/repo';
import { formatSource } from '@/lib/resolver';

const SOURCE_ICONS: Record<LatestSource, string> = {
  local_filesystem: '💾',
  local_git: '🌿',
  github_remote: '☁️',
};

const SOURCE_CLASSES: Record<LatestSource, string> = {
  local_filesystem: 'badge-local-fs',
  local_git: 'badge-local-git',
  github_remote: 'badge-github',
};

interface Props {
  source: LatestSource;
  compact?: boolean;
}

export default function HybridSourceBadge({ source, compact = false }: Props) {
  return (
    <span
      className={`hybrid-badge ${SOURCE_CLASSES[source] ?? ''}`}
      title={`Latest source: ${formatSource(source)}`}
    >
      <span className="badge-icon">{SOURCE_ICONS[source]}</span>
      {!compact && <span className="badge-label">{formatSource(source)}</span>}
    </span>
  );
}
