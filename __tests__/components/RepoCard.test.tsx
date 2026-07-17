/**
 * Tests for components/RepoCard.tsx.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import RepoCard from '@/components/RepoCard';
import type { TrackedRepo } from '@/types/repo';

// Mock next/link to a simple anchor
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

function makeRepo(overrides: Partial<TrackedRepo> = {}): TrackedRepo {
  return {
    id: 'abc123',
    name: 'my-project',
    source_type: 'local_only',
    latest_source: 'local_filesystem',
    current_branch: 'main',
    default_branch: 'main',
    is_private: false,
    description: 'A test project',
    language: 'TypeScript',
    topics: [],
    github_stars: 0,
    github_forks: 0,
    tags: ['active'],
    latest_activity_at: new Date(Date.now() - 86_400_000).toISOString(),
    sync: { local_ahead_by: 0, remote_ahead_by: 0, is_diverged: false, uncommitted_changes: 0, has_stash: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('RepoCard', () => {
  it('renders repo name', () => {
    render(<RepoCard repo={makeRepo()} />);
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<RepoCard repo={makeRepo()} />);
    expect(screen.getByText('A test project')).toBeInTheDocument();
  });

  it('renders current branch', () => {
    render(<RepoCard repo={makeRepo()} />);
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it('renders language badge', () => {
    render(<RepoCard repo={makeRepo()} />);
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('renders activity time', () => {
    render(<RepoCard repo={makeRepo()} />);
    // Should show "1d ago" or similar
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<RepoCard repo={makeRepo({ tags: ['local_only', 'unpushed'] })} />);
    expect(screen.getByText('local_only')).toBeInTheDocument();
    expect(screen.getByText('unpushed')).toBeInTheDocument();
  });

  it('links to correct repo detail page', () => {
    render(<RepoCard repo={makeRepo()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/repos/abc123');
  });

  it('hides description when not provided', () => {
    render(<RepoCard repo={makeRepo({ description: undefined })} />);
    expect(screen.queryByText('A test project')).not.toBeInTheDocument();
  });

  it('shows "No activity" when latest_activity_at is absent', () => {
    render(<RepoCard repo={makeRepo({ latest_activity_at: undefined })} />);
    expect(screen.getByText(/No activity/i)).toBeInTheDocument();
  });
});
