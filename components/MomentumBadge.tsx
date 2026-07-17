'use client';

import type { MomentumScore } from '@/types/metrics';
import { momentumColor, momentumIcon } from '@/lib/health';

interface Props {
  momentum?: MomentumScore | null;
}

export default function MomentumBadge({ momentum }: Props) {
  if (!momentum) return null;
  const color = momentumColor(momentum.level);
  const icon = momentumIcon(momentum.level);

  return (
    <span
      className={`momentum-badge momentum-${momentum.level}`}
      title={momentum.reason}
      style={{ borderColor: color, color }}
    >
      {icon} {momentum.level}
    </span>
  );
}
