'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

import type { TrackedRepo, FilterTag } from '@/types/repo';
import type { AgentStatus } from '@/types/agent';
import type { Collection } from '@/lib/collections';

import { getHybridRepos, getAgentStatus, triggerScan, updateRepoUserState } from '@/lib/agent';
import { getCollections } from '@/lib/collections';
import { exportReposAsCsv, exportReposAsPdf } from '@/lib/export';
import { getDeployedIds, setDeployed } from '@/lib/deployedRepos';
import { assignRepoToCollection, getRepoCollection } from '@/lib/collections';

import AgentStatusBar from '@/components/AgentStatus';
import SmartFilter, { buildFilterCounts } from '@/components/SmartFilter';
import CollectionsSidebar from '@/components/CollectionsSidebar';
import RepoListItem from '@/components/RepoListItem';
import StalenessAlert from '@/components/StalenessAlert';
import LocalModeBanner from '@/components/LocalModeBanner';
import Icon from '@/components/Icon';

export default function DashboardPage() {
  const { data: session, status } = useSession();

  const [repos, setRepos] = useState<TrackedRepo[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    online: false, version: '—', watching_folder_count: 0, repo_count: 0, ai_enabled: false,
  });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTag | 'all'>('all');
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deployedIds, setDeployedIds] = useState<Set<string>>(new Set());


  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [repoList, agStatus] = await Promise.all([getHybridRepos(), getAgentStatus()]);
    setRepos(repoList);
    setAgentStatus(agStatus);
    setCollections(getCollections());
    setIsLoading(false);
  }, []);

  // Deployed flags used to live only in this browser. Move any we still hold to the
  // agent, so scoring and every other device see them too.
  useEffect(() => {
    const local = getDeployedIds();
    setDeployedIds(local);
    if (local.size === 0) return;

    (async () => {
      let migrated = false;
      for (const id of local) {
        if (id.startsWith('gh-')) continue;  // no agent record to attach it to
        const updated = await updateRepoUserState(id, { deployed: true });
        if (updated) {
          setDeployed(id, false);
          migrated = true;
        }
      }
      if (migrated) {
        setDeployedIds(getDeployedIds());
        loadData();
      }
    })();
  }, [loadData]);

  useEffect(() => {
    if (status !== 'loading') loadData();
  }, [status, loadData]);

  const handleScan = async () => {
    await triggerScan();
    setTimeout(loadData, 2000);
  };

  const handleCollectionUpdate = () => {
    setCollections(getCollections());
  };

  // Repos the agent tracks keep their state in SQLite; GitHub-only rows stay in this browser
  const isAgentRepo = (id: string) => !id.startsWith('gh-');

  const handleDeployToggle = async (id: string, deployed: boolean) => {
    if (isAgentRepo(id)) {
      const updated = await updateRepoUserState(id, { deployed });
      if (updated) {
        setRepos(prev => prev.map(r => (r.id === id ? { ...r, tags: updated.tags } : r)));
        return;
      }
    }
    setDeployed(id, deployed);
    setDeployedIds(getDeployedIds());
  };

  const handleCollectionAssign = async (id: string, collectionId: string | null) => {
    if (isAgentRepo(id)) {
      const updated = await updateRepoUserState(id, { collection: collectionId });
      if (updated) {
        setRepos(prev => prev.map(r => (r.id === id ? { ...r, collection: updated.collection } : r)));
        return;
      }
    }
    assignRepoToCollection(id, collectionId);
    setRepos(prev => [...prev]);
  };

  // The agent already tags repos it tracks; localStorage covers GitHub-only rows
  const enrichedRepos = repos.map(r => {
    if (!deployedIds.has(r.id) || r.tags.includes('deployed')) return r;
    const tags = r.tags.filter(t => t !== 'stale');
    tags.push('deployed');
    return { ...r, tags };
  });

  // Filter repos
  const filtered = enrichedRepos.filter(r => {
    if (activeFilter !== 'all' && !r.tags.includes(activeFilter)) return false;
    const collectionId = r.collection ?? getRepoCollection(r.id);
    if (activeCollection !== null && collectionId !== activeCollection) return false;
    return true;
  });

  const counts = buildFilterCounts(enrichedRepos);

  // Stats
  const staleCount = enrichedRepos.filter(r => r.tags.includes('stale')).length;
  const unpushedCount = enrichedRepos.filter(r => r.tags.includes('unpushed')).length;
  const activeCount = enrichedRepos.filter(r => r.tags.includes('active')).length;
  const deployedCount = enrichedRepos.filter(r => r.tags.includes('deployed')).length;

  // Staleness alerts — skip deployed repos
  const stalenessAlerts = enrichedRepos.filter(
    r => r.staleness && ['high', 'critical'].includes(r.staleness.risk)
      && !r.tags.includes('deployed') && !r.tags.includes('missing')
  );

  if (status === 'loading' || isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading your coding cockpit…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <LocalModeBanner />

      {/* Agent Status Bar */}
      <AgentStatusBar status={agentStatus} onScan={handleScan} />

      {/* What needs attention — deployed and missing repos excluded */}
      <StalenessAlert repos={stalenessAlerts} />

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
          <header className="page-head">
            <div className="page-head-text">
              <h1 className="page-head-title">Repositories</h1>
              <p className="page-head-sub">
                {session?.user?.name
                  ? `${session.user.name.split(' ')[0]}'s work across ${enrichedRepos.length} tracked repos`
                  : `${enrichedRepos.length} tracked repos on this machine`}
              </p>
            </div>
            <div className="page-head-actions">
              <button className="btn-secondary btn-with-icon" onClick={() => exportReposAsCsv(filtered)} id="export-csv-btn">
                <Icon name="download" size={15} /> CSV
              </button>
              <button className="btn-secondary btn-with-icon" onClick={() => exportReposAsPdf(filtered)} id="export-pdf-btn">
                <Icon name="download" size={15} /> PDF
              </button>
            </div>
          </header>

          {/* Summary */}
          <div className="stat-strip">
            <div className="stat-cell">
              <span className="stat-value">{enrichedRepos.length}</span>
              <span className="stat-label">Tracked</span>
            </div>
            <div className="stat-cell">
              <span className="stat-value">{activeCount}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-cell">
              <span className="stat-value">{staleCount}</span>
              <span className="stat-label">Stale</span>
            </div>
            <div className="stat-cell">
              <span className="stat-value">{unpushedCount}</span>
              <span className="stat-label">Unpushed</span>
            </div>
            <div className="stat-cell">
              <span className="stat-value">{deployedCount}</span>
              <span className="stat-label">Deployed</span>
            </div>
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
              <Icon name={agentStatus.online ? 'search' : 'alert'} size={22} />
              <p className="empty-title">
                {agentStatus.online ? 'No repositories match this filter' : 'The local agent is not running'}
              </p>
              {agentStatus.online ? (
                <button className="btn-secondary btn-sm" onClick={() => setActiveFilter('all')}>
                  Clear filter
                </button>
              ) : (
                <p className="empty-hint">
                  Start it with <code>python agent/main.py</code>, then add folders in{' '}
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
                  isDeployed={repo.tags.includes('deployed')}
                  onDeployToggle={handleDeployToggle}
                  collections={collections}
                  collectionId={repo.collection ?? getRepoCollection(repo.id)}
                  onCollectionAssign={handleCollectionAssign}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
