/**
 * Tests for lib/health.ts — display utilities.
 */

import {
  healthColor, healthLabel, momentumColor, momentumIcon,
  stalenessColor, parseHealthDisplay, recoverySuggestions,
} from '@/lib/health';
import type { HealthScore } from '@/types/metrics';

function makeHealth(score: number, level: string, reasons: string[] = []): HealthScore {
  return {
    score,
    level: level as any,
    breakdown: {
      base_score: 50,
      commit_recency_bonus: 0,
      readme_bonus: 0,
      clean_branches_bonus: 0,
      stale_branch_penalty: 0,
      uncommitted_penalty: -10,
      no_activity_penalty: -15,
      reasons,
    },
  };
}

// Colours come from the monochrome design system tokens: strongest ink for the best state.
describe('healthColor', () => {
  it('uses ink for excellent', () => expect(healthColor('excellent')).toBe('var(--color-ink)'));
  it('uses silver for critical', () => expect(healthColor('critical')).toBe('var(--color-silver)'));
  it('uses slate for fair', () => expect(healthColor('fair')).toBe('var(--color-slate)'));
  it('gives every level a distinct token', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;
    expect(new Set(levels.map(healthColor)).size).toBe(levels.length);
  });
});

describe('healthLabel', () => {
  it('returns correct labels', () => {
    expect(healthLabel('excellent')).toBe('Excellent');
    expect(healthLabel('critical')).toBe('Critical');
    expect(healthLabel('good')).toBe('Good');
  });
});

describe('momentumColor', () => {
  it('ink for growing', () => expect(momentumColor('growing')).toBe('var(--color-ink)'));
  it('stone for declining', () => expect(momentumColor('declining')).toBe('var(--color-stone)'));
  it('slate for stable', () => expect(momentumColor('stable')).toBe('var(--color-slate)'));
});

describe('momentumIcon', () => {
  it('up arrow for growing', () => expect(momentumIcon('growing')).toBe('↑'));
  it('right arrow for stable', () => expect(momentumIcon('stable')).toBe('→'));
  it('down arrow for declining', () => expect(momentumIcon('declining')).toBe('↓'));
});

describe('stalenessColor', () => {
  it('ink for low', () => expect(stalenessColor('low')).toBe('var(--color-ink)'));
  it('stone for critical', () => expect(stalenessColor('critical')).toBe('var(--color-stone)'));
});

describe('parseHealthDisplay', () => {
  it('returns defaults for null', () => {
    const d = parseHealthDisplay(null);
    expect(d.score).toBe(0);
    expect(d.level).toBe('critical');
    expect(d.reasons.length).toBeGreaterThan(0);
  });

  it('returns correct display for valid health', () => {
    const d = parseHealthDisplay(makeHealth(85, 'excellent', ['Good commit frequency']));
    expect(d.score).toBe(85);
    expect(d.level).toBe('excellent');
    expect(d.color).toBe('var(--color-ink)');
    expect(d.reasons).toContain('Good commit frequency');
  });
});

describe('recoverySuggestions', () => {
  it('suggests committing when uncommitted_penalty is high', () => {
    const health = makeHealth(40, 'poor');
    health.breakdown.uncommitted_penalty = -10;
    const s = recoverySuggestions(health, null);
    expect(s.some(x => x.toLowerCase().includes('commit'))).toBe(true);
  });

  it('suggests readme when readme_bonus is 0', () => {
    const health = makeHealth(40, 'poor');
    health.breakdown.readme_bonus = 0;
    const s = recoverySuggestions(health, null);
    expect(s.some(x => x.toLowerCase().includes('readme'))).toBe(true);
  });

  it('returns empty for healthy repo with low staleness', () => {
    const health = makeHealth(90, 'excellent');
    health.breakdown.uncommitted_penalty = 0;
    health.breakdown.stale_branch_penalty = 0;
    health.breakdown.readme_bonus = 10;
    health.breakdown.no_activity_penalty = 0;
    const s = recoverySuggestions(health, { risk: 'low', days_since_activity: 1, days_until_stale: 29, days_until_dead: 89, message: '' });
    expect(s.length).toBe(0);
  });
});
