/**
 * Tests for components/HybridSourceBadge.tsx.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import HybridSourceBadge from '@/components/HybridSourceBadge';

describe('HybridSourceBadge', () => {
  it('shows "Local Files" for local_filesystem', () => {
    render(<HybridSourceBadge source="local_filesystem" />);
    expect(screen.getByText('Local Files')).toBeInTheDocument();
  });

  it('shows "Local Git" for local_git', () => {
    render(<HybridSourceBadge source="local_git" />);
    expect(screen.getByText('Local Git')).toBeInTheDocument();
  });

  it('shows "GitHub" for github_remote', () => {
    render(<HybridSourceBadge source="github_remote" />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('hides label text in compact mode', () => {
    render(<HybridSourceBadge source="local_filesystem" compact />);
    expect(screen.queryByText('Local Files')).not.toBeInTheDocument();
  });

  it('applies correct CSS class for each source', () => {
    const { container } = render(<HybridSourceBadge source="local_filesystem" />);
    expect(container.firstChild).toHaveClass('badge-local-fs');
  });

  it('applies github class for github_remote', () => {
    const { container } = render(<HybridSourceBadge source="github_remote" />);
    expect(container.firstChild).toHaveClass('badge-github');
  });

  it('has a title attribute with source description', () => {
    render(<HybridSourceBadge source="local_git" />);
    const badge = screen.getByTitle(/Freshest source: Local Git/i);
    expect(badge).toBeInTheDocument();
  });
});
