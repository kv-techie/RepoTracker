'use client';

import type { HealthScore } from '@/types/metrics';
import type { StalenessInfo } from '@/types/metrics';
import { recoverySuggestions } from '@/lib/health';

interface Props {
  health?: HealthScore | null;
  staleness?: StalenessInfo | null;
}

export default function RecoverySuggestions({ health, staleness }: Props) {
  const suggestions = recoverySuggestions(health, staleness);
  if (!suggestions.length) return null;

  return (
    <div className="recovery-panel">
      <h4 className="recovery-title">💡 Recovery Suggestions</h4>
      <ul className="recovery-list">
        {suggestions.map((s, i) => (
          <li key={i} className="recovery-item">
            <span className="recovery-arrow">→</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
