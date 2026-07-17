/**
 * Health score display utilities.
 * Parses explainable scores and generates human-readable summaries.
 */

import type { HealthScore, StalenessInfo, HealthLevel, MomentumLevel, StalenessRisk } from '@/types/metrics';

export interface HealthDisplay {
  score: number;
  level: HealthLevel;
  color: string;
  label: string;
  reasons: string[];
}

export function parseHealthDisplay(health?: HealthScore | null): HealthDisplay {
  if (!health) {
    return { score: 0, level: 'critical', color: '#ef4444', label: 'No data', reasons: ['No health data available'] };
  }
  return {
    score: health.score,
    level: health.level,
    color: healthColor(health.level),
    label: healthLabel(health.level),
    reasons: health.breakdown.reasons,
  };
}

export function healthColor(level: HealthLevel): string {
  const map: Record<HealthLevel, string> = {
    excellent: 'var(--color-ink)',
    good: 'var(--color-graphite)',
    fair: 'var(--color-slate)',
    poor: 'var(--color-stone)',
    critical: 'var(--color-silver)',
  };
  return map[level] ?? 'var(--color-slate)';
}

export function healthLabel(level: HealthLevel): string {
  const map: Record<HealthLevel, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    critical: 'Critical',
  };
  return map[level] ?? level;
}

export function momentumColor(level: MomentumLevel): string {
  const map: Record<MomentumLevel, string> = {
    growing: 'var(--color-ink)',
    stable: 'var(--color-slate)',
    declining: 'var(--color-stone)',
  };
  return map[level] ?? 'var(--color-slate)';
}

export function momentumIcon(level: MomentumLevel): string {
  return { growing: '↑', stable: '→', declining: '↓' }[level] ?? '—';
}

export function stalenessColor(risk: StalenessRisk): string {
  const map: Record<StalenessRisk, string> = {
    low: 'var(--color-ink)',
    moderate: 'var(--color-graphite)',
    high: 'var(--color-slate)',
    critical: 'var(--color-stone)',
  };
  return map[risk] ?? 'var(--color-slate)';
}

export function recoverySuggestions(health?: HealthScore | null, staleness?: StalenessInfo | null): string[] {
  const suggestions: string[] = [];
  if (!health) return suggestions;
  const { breakdown } = health;

  if (breakdown.uncommitted_penalty < -5) {
    suggestions.push('Commit your local changes to preserve your work.');
  }
  if (breakdown.stale_branch_penalty < -5) {
    suggestions.push('Delete or merge stale branches to clean up your repo.');
  }
  if (breakdown.readme_bonus === 0) {
    suggestions.push('Add a README.md to document your project.');
  }
  if (staleness && (staleness.risk === 'high' || staleness.risk === 'critical')) {
    suggestions.push('Resume work on this project or archive it to declutter.');
  }
  if (breakdown.no_activity_penalty < -10) {
    suggestions.push('Push your local commits to keep the remote in sync.');
  }
  return suggestions;
}
