'use client';

interface ProgressBarProps {
  percentage: number;
  label?: string;
  showLabel?: boolean;
}

export default function ProgressBar({
  percentage,
  label,
  showLabel = true,
}: ProgressBarProps) {
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="progress-bar-container">
      {showLabel && (
        <div className="progress-bar-label">
          <span>{label || 'Progress'}</span>
          <span className="progress-bar-percentage">{clampedPercentage}%</span>
        </div>
      )}
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    </div>
  );
}
