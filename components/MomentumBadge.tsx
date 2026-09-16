'use client';

import type { MomentumScore } from '@/types/metrics';
import { momentumIcon } from '@/lib/health';

interface Props {
  momentum?: MomentumScore | null;
}

export default function MomentumBadge({ momentum }: Props) {
  if (!momentum) return null;
  return (
    <span className={`momentum-badge momentum-${momentum.level}`} title={momentum.reason}>
      <span aria-hidden="true">{momentumIcon(momentum.level)}</span>
      {momentum.level}
    </span>
  );
}
