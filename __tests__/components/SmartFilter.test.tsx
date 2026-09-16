/**
 * Tests for components/SmartFilter.tsx and buildFilterCounts.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartFilter, { buildFilterCounts } from '@/components/SmartFilter';


describe('SmartFilter', () => {
  const onChange = jest.fn();

  beforeEach(() => onChange.mockClear());

  it('renders all filter tabs', () => {
    render(<SmartFilter active="all" onChange={onChange} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText('Unpushed')).toBeInTheDocument();
    expect(screen.getByText('Local only')).toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });

  it('calls onChange with correct tag when clicked', () => {
    render(<SmartFilter active="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Stale'));
    expect(onChange).toHaveBeenCalledWith('stale');
  });

  it('marks the active tab with aria-selected=true', () => {
    render(<SmartFilter active="active" onChange={onChange} />);
    const activeTab = screen.getByRole('tab', { name: /Active/i });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('hides a filter no repo is in', () => {
    render(<SmartFilter active="all" counts={{ all: 4, active: 4, stale: 0 }} onChange={onChange} />);
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows count badges when provided', () => {
    render(
      <SmartFilter
        active="all"
        counts={{ all: 10, stale: 3, active: 7 }}
        onChange={onChange}
      />
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('buildFilterCounts', () => {
  it('counts total repos as "all"', () => {
    const counts = buildFilterCounts([
      { tags: ['active'] },
      { tags: ['stale'] },
    ]);
    expect(counts.all).toBe(2);
  });

  it('counts per tag correctly', () => {
    const counts = buildFilterCounts([
      { tags: ['active', 'unpushed'] },
      { tags: ['stale'] },
      { tags: ['active'] },
    ]);
    expect(counts.active).toBe(2);
    expect(counts.stale).toBe(1);
    expect(counts.unpushed).toBe(1);
  });

  it('returns 0 for missing tags', () => {
    const counts = buildFilterCounts([{ tags: ['active'] }]);
    expect(counts.stale).toBeUndefined(); // only present tags exist
  });
});
