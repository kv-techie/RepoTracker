'use client';

import type { ReadmeScore as ReadmeScoreType } from '@/types/metrics';

interface Props {
  readme?: ReadmeScoreType | null;
}

export default function ReadmeScore({ readme }: Props) {
  if (!readme) return null;

  const pct = readme.score;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="readme-score-card">
      <div className="readme-score-header">
        <span className="readme-score-label">README Quality</span>
        <span className="readme-score-value" style={{ color }}>{pct}/100</span>
      </div>

      <div className="readme-progress-bar">
        <div
          className="readme-progress-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {readme.missing_sections.length > 0 && (
        <div className="readme-missing">
          <p className="readme-missing-title">Missing sections:</p>
          <ul>
            {readme.missing_sections.map(s => (
              <li key={s} className="readme-missing-item">📄 {s}</li>
            ))}
          </ul>
        </div>
      )}

      {readme.badge_suggestions.length > 0 && (
        <div className="readme-badges">
          <p className="readme-badges-title">Suggested badges:</p>
          <div className="badge-list">
            {readme.badge_suggestions.map(b => (
              <span key={b} className="badge-suggestion">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
