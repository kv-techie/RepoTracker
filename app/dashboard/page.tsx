'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import type { TrackedRepo, FilterTag } from '@/types/repo';
import type { AgentStatus } from '@/types/agent';
import type { Collection } from '@/lib/collections';

import { getHybridRepos, getAgentStatus, triggerScan } from '@/lib/agent';
import { getCollections } from '@/lib/collections';
import { exportReposAsCsv, exportReposAsPdf } from '@/lib/export';
import { getDeployedIds, setDeployed } from '@/lib/deployedRepos';

import AgentStatusBar from '@/components/AgentStatus';
import SmartFilter, { buildFilterCounts } from '@/components/SmartFilter';
import CollectionsSidebar from '@/components/CollectionsSidebar';
import RepoListItem from '@/components/RepoListItem';
import StalenessAlert from '@/components/StalenessAlert';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<TrackedRepo[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    online: false, version: '—', watching_folders: [], db_path: '', repo_count: 0, ai_enabled: false,
  });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTag | 'all'>('all');
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deployedIds, setDeployedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Load deployed IDs from localStorage on mount
  useEffect(() => {
    setDeployedIds(getDeployedIds());
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [repoList, agStatus] = await Promise.all([getHybridRepos(), getAgentStatus()]);
    setRepos(repoList);
    setAgentStatus(agStatus);
    setCollections(getCollections());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') loadData();
  }, [status, loadData]);

  const handleScan = async () => {
    await triggerScan();
    setTimeout(loadData, 2000);
  };

  const handleCollectionUpdate = () => {
    setCollections(getCollections());
  };

  const handleDeployToggle = (id: string, deployed: boolean) => {
    setDeployed(id, deployed);
    setDeployedIds(getDeployedIds());
  };

  // Inject deployed tag + suppress stale tag for deployed repos
  const enrichedRepos = repos.map(r => {
    if (!deployedIds.has(r.id)) return r;
    const tags = r.tags.filter(t => t !== 'stale');
    if (!tags.includes('deployed')) tags.push('deployed');
    return { ...r, tags };
  });

  // Filter repos
  const filtered = enrichedRepos.filter(r => {
    if (activeFilter !== 'all' && !r.tags.includes(activeFilter)) return false;
    if (activeCollection !== null && r.collection !== activeCollection) return false;
    return true;
  });

  const counts = buildFilterCounts(enrichedRepos);

  // Stats
  const staleCount = enrichedRepos.filter(r => r.tags.includes('stale')).length;
  const unpushedCount = enrichedRepos.filter(r => r.tags.includes('unpushed')).length;
  const activeCount = enrichedRepos.filter(r => r.tags.includes('active')).length;
  const deployedCount = deployedIds.size;

  // Staleness alerts — skip deployed repos
  const stalenessAlerts = enrichedRepos.filter(
    r => r.staleness && ['high', 'critical'].includes(r.staleness.risk) && !deployedIds.has(r.id)
  );

  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading your coding cockpit…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      {/* Agent Status Bar */}
      <AgentStatusBar status={agentStatus} onScan={handleScan} />

      {/* Staleness Alerts — deployed repos excluded */}
      {stalenessAlerts.length > 0 && (
        <section className="alerts-section">
          {stalenessAlerts.slice(0, 3).map(r => (
            r.staleness && <StalenessAlert key={r.id} staleness={r.staleness} repoName={r.name} />
          ))}
        </section>
      )}

      <div className="dashboard-layout">
        {/* Sidebar */}
        <CollectionsSidebar
          collections={collections}
          activeId={activeCollection}
          onSelect={setActiveCollection}
          onUpdate={handleCollectionUpdate}
        />

        {/* Main content */}
        <main className="dashboard-main">
          {/* Header */}
          <div className="dashboard-header">
            <div>
              <h1 className="dashboard-title">Your Coding Cockpit</h1>
              <p className="dashboard-sub">Welcome back, {session?.user?.name?.split(' ')[0] ?? 'developer'}</p>
            </div>
            <div className="dashboard-actions">
              <button
                className="btn-secondary"
                onClick={() => exportReposAsCsv(repos)}
                id="export-csv-btn"
              >
                ↓ CSV
              </button>
              <button
                className="btn-secondary"
                onClick={() => exportReposAsPdf(repos)}
                id="export-pdf-btn"
              >
                ↓ PDF
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="stats-bar">
            <div className="stat-pill">
              <span className="stat-pill-value">{enrichedRepos.length}</span>
              <span className="stat-pill-label">Tracked</span>
            </div>
            <div className="stat-pill stat-pill--green">
              <span className="stat-pill-value">{activeCount}</span>
              <span className="stat-pill-label">Active</span>
            </div>
            <div className="stat-pill stat-pill--amber">
              <span className="stat-pill-value">{staleCount}</span>
              <span className="stat-pill-label">Stale</span>
            </div>
            <div className="stat-pill stat-pill--indigo">
              <span className="stat-pill-value">{unpushedCount}</span>
              <span className="stat-pill-label">Unpushed</span>
            </div>
            {deployedCount > 0 && (
              <div className="stat-pill stat-pill--teal">
                <span className="stat-pill-value">{deployedCount}</span>
                <span className="stat-pill-label">Deployed</span>
              </div>
            )}
          </div>

          {/* Smart Filter */}
          <SmartFilter
            active={activeFilter}
            counts={counts}
            onChange={setActiveFilter}
          />

          {/* Repo Grid */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>No repositories match this filter.</p>
              {!agentStatus.online && (
                <p className="empty-hint">
                  Start the local agent (<code>python agent/main.py</code>) and configure watched folders in{' '}
                  <a href="/settings">Settings</a>.
                </p>
              )}
            </div>
          ) : (
            <div className="repo-list" id="repo-list">
              {filtered.map(repo => (
                <RepoListItem
                  key={repo.id}
                  repo={repo}
                  isDeployed={deployedIds.has(repo.id)}
                  onDeployToggle={handleDeployToggle}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
