'use client';

import type { ActivityScore } from '@/types/metrics';

interface ActivityScoreProps {
  score: ActivityScore;
}

export default function ActivityScoreComponent({ score }: ActivityScoreProps) {
  const getScoreColor = (level: string): string => {
    switch (level) {
      case 'very-high':
        return '#10b981';
      case 'high':
        return '#3b82f6';
      case 'moderate':
        return '#f59e0b';
      case 'low':
        return '#ef4444';
      case 'critical':
        return '#7f1d1d';
      default:
        return '#6b7280';
    }
  };

  return (
    <div className="activity-score">
      <div className="score-display">
        <div
          className="score-circle"
          style={{ borderColor: getScoreColor(score.level) }}
        >
          <span className="score-value">{score.score}</span>
        </div>
        <div className="score-details">
          <div className="score-level">{score.level.toUpperCase()}</div>
          <div className="score-trend">
            Last commit: {score.lastCommitAge} days ago
          </div>
          <div className="score-trend">
            Trend: {score.frequencyTrend.replace('-', ' ')}
          </div>
        </div>
      </div>
    </div>
  );
}
