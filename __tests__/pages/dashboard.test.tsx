/**
 * Page-level tests for the dashboard: the layer that was only ever checked by hand.
 * Everything the page needs is mocked, so these run without an agent or a network.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import type { TrackedRepo } from '@/types/repo';

const mockSession = { data: null as any, status: 'unauthenticated' as string };

jest.mock('next-auth/react', () => ({
  useSession: () => mockSession,
  signIn: jest.fn(),
}));

const repos: TrackedRepo[] = [
  {
    id: 'r1',
    name: 'active-repo',
    source_type: 'local_only',
    latest_source: 'local_git',
    current_branch: 'main',
    default_branch: 'main',
    latest_activity_at: new Date().toISOString(),
    sync: { local_ahead_by: 2, remote_ahead_by: 0, is_diverged: false, uncommitted_changes: 0, has_stash: false },
    health: { score: 90, level: 'excellent', breakdown: { base_score: 50, commit_recency_bonus: 20, readme_bonus: 10, clean_branches_bonus: 10, stale_branch_penalty: 0, uncommitted_penalty: 0, no_activity_penalty: 0, reasons: ['Active commit in last 3 days (+20)'] } },
    staleness: { risk: 'low', days_since_activity: 0, days_until_stale: 30, days_until_dead: 90, message: 'Recently active.' },
    tags: ['active', 'unpushed'],
    created_at: '', updated_at: '',
  } as unknown as TrackedRepo,
  {
    id: 'r2',
    name: 'abandoned-repo',
    source_type: 'local_only',
    latest_source: 'local_filesystem',
    current_branch: 'main',
    default_branch: 'main',
    latest_activity_at: '2025-01-01T00:00:00Z',
    sync: { local_ahead_by: 0, remote_ahead_by: 0, is_diverged: false, uncommitted_changes: 0, has_stash: false },
    health: { score: 25, level: 'critical', breakdown: { base_score: 50, commit_recency_bonus: 0, readme_bonus: 0, clean_branches_bonus: 10, stale_branch_penalty: 0, uncommitted_penalty: 0, no_activity_penalty: -25, reasons: [] } },
    staleness: { risk: 'critical', days_since_activity: 200, days_until_stale: -170, days_until_dead: -110, message: 'This repo may be abandoned.' },
    tags: ['stale'],
    created_at: '', updated_at: '',
  } as unknown as TrackedRepo,
];

jest.mock('@/lib/agent', () => ({
  getHybridRepos: jest.fn(async () => repos),
  getAgentStatus: jest.fn(async () => ({
    online: true, version: '1.0.0', watching_folder_count: 2, repo_count: 2, ai_enabled: true,
  })),
  triggerScan: jest.fn(async () => ({ message: 'Scan triggered' })),
  updateRepoUserState: jest.fn(async () => null),
}));

describe('Dashboard page', () => {
  beforeEach(() => {
    mockSession.status = 'unauthenticated';
    mockSession.data = null;
    window.localStorage.clear();
  });

  it('shows repos from the agent without a GitHub session', async () => {
    render(<DashboardPage />);

    // Names also appear in the attention bar, so assert on the row links
    expect(await screen.findByRole('link', { name: 'active-repo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'abandoned-repo' })).toBeInTheDocument();
  });

  it('offers sign-in but does not block local data', async () => {
    render(<DashboardPage />);

    await screen.findByRole('link', { name: 'active-repo' });
    expect(screen.getByText(/Local mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with GitHub/i })).toBeInTheDocument();
  });

  it('summarises what needs attention', async () => {
    render(<DashboardPage />);

    await screen.findByRole('link', { name: 'active-repo' });
    // one repo is critical, so the attention bar names it
    const bar = screen.getByRole('status', { name: /need attention/i });
    expect(bar).toHaveTextContent('need attention');
    expect(bar).toHaveTextContent('abandoned-repo');
    expect(bar).not.toHaveTextContent('active-repo');
  });

  it('counts each state in the summary strip', async () => {
    render(<DashboardPage />);

    await screen.findByRole('link', { name: 'active-repo' });
    const tracked = screen.getByText('Tracked').closest('.stat-cell');
    expect(tracked).toHaveTextContent('2');
  });

  it('hides the banner once signed in', async () => {
    mockSession.status = 'authenticated';
    mockSession.data = { user: { name: 'Kedhar Vinod' } };

    render(<DashboardPage />);

    await screen.findByRole('link', { name: 'active-repo' });
    await waitFor(() => expect(screen.queryByText(/Local mode/i)).not.toBeInTheDocument());
  });
});
