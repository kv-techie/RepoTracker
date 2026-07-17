'use client';

import type { HealthScore } from '@/types/metrics';
import { parseHealthDisplay } from '@/lib/health';
import { useState } from 'react';

interface Props {
  health?: HealthScore | null;
  size?: number;
}

export default function HealthRing({ health, size = 56 }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const display = parseHealthDisplay(health);

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (display.score / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="health-ring-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="health-ring-btn"
        onClick={() => setShowBreakdown(v => !v)}
        title={`Health: ${display.score}/100 — click for breakdown`}
        aria-label={`Health score: ${display.score}/100, level: ${display.level}`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={5}
          />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={display.color}
            strokeWidth={5}
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
          {/* Score text */}
          <text
            x={cx} y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size < 48 ? '9' : '12'}
            fontWeight="700"
            fill={display.color}
          >
            {display.score}
          </text>
        </svg>
      </button>

      {showBreakdown && (
        <div className="health-breakdown-popup" role="dialog" aria-label="Health breakdown">
          <div className="breakdown-header">
            <span>Health: {display.score}/100</span>
            <button onClick={() => setShowBreakdown(false)} className="close-btn" aria-label="Close">×</button>
          </div>
          <ul className="breakdown-reasons">
            {display.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
