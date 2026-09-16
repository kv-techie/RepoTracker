'use client';

import type { ReadmeScore as ReadmeScoreType } from '@/types/metrics';
import Icon from './Icon';

interface Props {
  readme?: ReadmeScoreType | null;
}

export default function ReadmeScore({ readme }: Props) {
  if (!readme) return null;

  const pct = readme.score;
  const tone = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'risk';

  return (
    <div className="readme-score-card">
      <div className="readme-score-header">
        <span className="readme-score-label">README quality</span>
        <span className={`readme-score-value tone-${tone}`}>{pct}/100</span>
      </div>

      <div className="readme-progress-bar">
        <div className={`readme-progress-fill readme-progress-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>

      {typeof readme.word_count === 'number' && (
        <p className="readme-meta">
          {readme.word_count} words · {readme.code_block_count ?? 0} code block
          {readme.code_block_count === 1 ? '' : 's'}
          {readme.has_screenshots ? ' · has a screenshot' : ''}
        </p>
      )}

      {(readme.evidence?.length ?? 0) > 0 && (
        <div className="readme-evidence">
          <p className="readme-list-title">What the README gives a newcomer</p>
          <ul>
            {readme.evidence!.map(item => (
              <li key={item} className="readme-evidence-item">
                <Icon name="check" size={13} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {readme.missing_sections.length > 0 && (
        <div className="readme-missing">
          <p className="readme-list-title">Missing</p>
          <ul>
            {readme.missing_sections.map(s => (
              <li key={s} className="readme-missing-item">
                <Icon name="circle-slash" size={13} />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {readme.badge_suggestions.length > 0 && (
        <div className="readme-badges">
          <p className="readme-list-title">Suggested badges</p>
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
