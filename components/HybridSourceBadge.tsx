'use client';

import type { LatestSource } from '@/types/repo';
import { formatSource } from '@/lib/resolver';
import Icon, { type IconName } from './Icon';

const SOURCE_ICONS: Record<LatestSource, IconName> = {
  local_filesystem: 'drive',
  local_git: 'activity',
  github_remote: 'globe',
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

/** Says which of the three sources was freshest for this repo. */
export default function HybridSourceBadge({ source, compact = false }: Props) {
  const label = formatSource(source);

  return (
    <span
      className={`hybrid-badge ${SOURCE_CLASSES[source] ?? ''}`}
      title={`Freshest source: ${label}`}
    >
      <Icon name={SOURCE_ICONS[source] ?? 'drive'} size={13} className="badge-icon" label={compact ? label : undefined} />
      {!compact && <span className="badge-label">{label}</span>}
    </span>
  );
}
