/**
 * Tests for components/HealthRing.tsx.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HealthRing from '@/components/HealthRing';
import type { HealthScore } from '@/types/metrics';

function makeHealth(score: number, level: string): HealthScore {
  return {
    score,
    level: level as any,
    breakdown: {
      base_score: 50,
      commit_recency_bonus: score > 60 ? 20 : 0,
      readme_bonus: 10,
      clean_branches_bonus: 0,
      stale_branch_penalty: 0,
      uncommitted_penalty: 0,
      no_activity_penalty: 0,
      reasons: ['Test reason 1', 'Test reason 2'],
    },
  };
}

describe('HealthRing', () => {
  it('renders score text', () => {
    render(<HealthRing health={makeHealth(75, 'good')} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('renders score 0 for null health', () => {
    render(<HealthRing health={null} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows breakdown popup on click', () => {
    render(<HealthRing health={makeHealth(75, 'good')} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test reason 1')).toBeInTheDocument();
  });

  it('closes breakdown popup on close button click', () => {
    render(<HealthRing health={makeHealth(75, 'good')} />);
    fireEvent.click(screen.getByRole('button', { name: /health score/i }));
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has accessible label on the button', () => {
    render(<HealthRing health={makeHealth(80, 'good')} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label', expect.stringContaining('80'));
  });

  it('renders SVG ring', () => {
    const { container } = render(<HealthRing health={makeHealth(50, 'fair')} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
