'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { TrackedRepo } from '@/types/repo';
import type { Commit } from '@/types/repo';
import HealthRing from '@/components/HealthRing';
import HybridSourceBadge from '@/components/HybridSourceBadge';
import SyncStatus from '@/components/SyncStatus';
import MomentumBadge from '@/components/MomentumBadge';
import ReadmeScore from '@/components/ReadmeScore';
import CommitTimeline from '@/components/CommitTimeline';
import RecoverySuggestions from '@/components/RecoverySuggestions';
import Icon from '@/components/Icon';
import { timeAgo } from '@/lib/resolver';
import { isDeployed as checkIsDeployed } from '@/lib/deployedRepos';

export default function RepoDetailPage() {
  const router = useRouter();
  const { name: unwrappedName } = useParams<{ name: string }>();
  const [repo, setRepo] = useState<TrackedRepo | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDeployed, setIsDeployed] = useState(false);
  const [githubDate, setGithubDate] = useState<string | null>(null);
  const [healthChanges, setHealthChanges] = useState<string[]>([]);

  useEffect(() => {
    const id = unwrappedName;
    
    async function loadData() {
      try {
        // 1. Find the repo using hybrid logic
        const { getHybridRepos } = await import('@/lib/agent');
        const allRepos = await getHybridRepos();
        const foundRepo = allRepos.find(r => r.id === id);
        
        if (!foundRepo) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
        
        setRepo(foundRepo);
        setIsDeployed(foundRepo.tags.includes('deployed') || checkIsDeployed(foundRepo.id));

        if (!id.startsWith('gh-')) {
          const { getRepoHealthDetail } = await import('@/lib/agent');
          getRepoHealthDetail(id).then(data => setHealthChanges(data?.changes ?? []));
        }

        // 2. Fetch commits based on repo type
        let commitData: Commit[] = [];
        if (id.startsWith('gh-') && foundRepo.source_type === 'github') {
          // GitHub-only repo: fetch from GitHub API
          const url = `/api/github/commits?owner=${foundRepo.name.split('/')[0]}&repo=${foundRepo.name.split('/')[1] || foundRepo.name}`;
          const res = await fetch(url).catch(() => null);
          if (res?.ok) {
            const data: any[] = await res.json();
            commitData = data.map(c => ({
              sha: c.sha,
              message: c.commit?.message?.split('\n')[0] ?? '',
              author: c.commit?.author?.name ?? '',
              committed_at: c.commit?.author?.date ?? '',
              files_changed: 0,
              insertions: 0,
              deletions: 0,
              repo_id: id,
            }));
          }
        } else {
          // Local/Hybrid repo: fetch from local agent
          commitData = await fetch(`/api/agent/repos/${id}/commits`)
            .then(r => r.ok ? r.json() : [])
            .catch(() => []);
            
          // For hybrid repos, asynchronously fetch the latest remote commit to display accurate GitHub date
          if (foundRepo.remote_url?.includes('github.com')) {
            const match = foundRepo.remote_url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
            if (match) {
              const url = `/api/github/commits?owner=${match[1]}&repo=${match[2]}`;
              fetch(url).then(r => r.ok ? r.json() : null).then(data => {
                if (data && data.length > 0 && data[0].commit?.author?.date) {
                  setGithubDate(data[0].commit.author.date);
                }
              }).catch(() => {});
            }
          }
        }
        
        if (id.startsWith('gh-') && foundRepo.source_type === 'github' && commitData.length > 0) {
          setGithubDate(commitData[0].committed_at);
        }
        
        setCommits(commitData);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load repo data:', err);
        setNotFound(true);
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [unwrappedName]);

  if (isLoading) return <div className="dashboard-loading"><div className="loading-spinner" /></div>;
  if (notFound || !repo) return (
    <div className="not-found">
      <h1>Repository not found</h1>
      <button onClick={() => router.push('/dashboard')} className="btn-primary">← Back</button>
    </div>
  );

  return (
    <div className="repo-detail-page">
      {/* Header */}
      <div className="repo-detail-header">
        <button onClick={() => router.push('/dashboard')} className="back-btn">← Dashboard</button>
        <div className="repo-detail-title-row">
          <h1 className="repo-detail-name">{repo.name}</h1>
          <HybridSourceBadge source={repo.latest_source} />
        </div>
        {repo.description && <p className="repo-detail-desc">{repo.description}</p>}
        <div className="repo-detail-meta">
          <span className="repo-branch">{repo.current_branch}</span>
          {repo.language && <span className="repo-lang">{repo.language}</span>}
        </div>
      </div>

      {/* Score row */}
      {isDeployed ? (
        <div className="score-row deployed-score-row">
          <span className="deployed-pill">
            Deployed
          </span>
          <p className="deployed-text">
            Marked as deployed, so it is not scored for going quiet: no staleness risk, no momentum
            trend, and no inactivity penalty in its health score. Uncommitted work and a missing
            README still count.
          </p>
        </div>
      ) : (
        <div className="score-row">
          <div className="score-card">
            <HealthRing health={repo.health} size={72} />
            <span className="score-label">Health</span>
            {healthChanges.length > 0 && (
              <p className="score-reason">Since last change: {healthChanges.join(', ')}</p>
            )}
          </div>
          <div className="score-card">
            <MomentumBadge momentum={repo.momentum} />
            <span className="score-label">Momentum</span>
            {repo.momentum && <p className="score-reason">{repo.momentum.reason}</p>}
          </div>
          <div className="score-card">
            {repo.staleness && (
              <>
                <span className={`staleness-chip staleness-${repo.staleness.risk}`}>
                  {repo.staleness.risk}
                </span>
                <span className="score-label">Staleness</span>
                <p className="score-reason">{repo.staleness.message}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sync + Recovery */}
      <div className="detail-section-row">
        <section className="detail-section">
          <h2 className="section-title">Sync Status</h2>
          <SyncStatus repo={repo} />
          <div className="sync-detail-grid">
            <div className="sync-detail-item">
              <span className="sync-detail-label">Uncommitted changes</span>
              <span className="sync-detail-value">{repo.sync.uncommitted_changes}</span>
            </div>
            <div className="sync-detail-item">
              <span className="sync-detail-label">Local ahead by</span>
              <span className="sync-detail-value">{repo.sync.local_ahead_by}</span>
            </div>
            <div className="sync-detail-item">
              <span className="sync-detail-label">Remote ahead by</span>
              <span className="sync-detail-value">{repo.sync.remote_ahead_by}</span>
            </div>
            <div className="sync-detail-item">
              <span className="sync-detail-label">Diverged</span>
              <span className="sync-detail-value">{repo.sync.is_diverged ? 'Yes ⚡' : 'No'}</span>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h2 className="section-title">Recovery Suggestions</h2>
          <RecoverySuggestions health={repo.health} staleness={repo.staleness} />
        </section>
      </div>

      {/* File Intelligence */}
      {repo.file_intelligence && (
        <section className="detail-section">
          <h2 className="section-title">File Intelligence</h2>
          <div className="file-intel-grid">
            <div className="file-intel-stat">
              <span className="file-intel-value">{repo.file_intelligence.total_files}</span>
              <span className="file-intel-label">Total files</span>
            </div>
            <div className="file-intel-stat">
              <span className="file-intel-value">
                ~{Math.round((repo.file_intelligence.total_tokens ?? 0) / 1000)}k
              </span>
              <span className="file-intel-label">AI tokens</span>
            </div>
            <div className="file-intel-stat">
              <span className="file-intel-value">{repo.file_intelligence.test_file_count ?? 0}</span>
              <span className="file-intel-label">Test files</span>
            </div>
          </div>
          {repo.file_intelligence.recently_modified.length > 0 && (
            <div className="recently-modified">
              <h3 className="sub-section-title">Recently Modified (7d)</h3>
              <ul className="file-list">
                {repo.file_intelligence.recently_modified.slice(0, 10).map(f => (
                  <li key={f} className="file-item"><code>{f}</code></li>
                ))}
              </ul>
            </div>
          )}
          {(repo.file_intelligence.hotspots?.length ?? 0) > 0 && (
            <div className="hotspots">
              <h3 className="sub-section-title">Hotspots (most changed recently)</h3>
              <ul className="file-list">
                {repo.file_intelligence.hotspots.slice(0, 5).map(h => (
                  <li key={h.path} className="file-item">
                    <code>{h.path}</code>
                    <span className="file-size">{h.change_count} commits</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {repo.file_intelligence.large_files.length > 0 && (
            <div className="large-files">
              <h3 className="sub-section-title">Large Files</h3>
              <ul className="file-list">
                {repo.file_intelligence.large_files.slice(0, 5).map(f => (
                  <li key={f.path} className="file-item">
                    <code>{f.path}</code>
                    <span className="file-size">{(f.size_bytes / 1024).toFixed(1)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* README Score */}
      <section className="detail-section">
        <h2 className="section-title">README Intelligence</h2>
        <ReadmeScore readme={repo.readme} />
      </section>

      {/* Commit Timeline */}
      <section className="detail-section">
        <h2 className="section-title">Commit History</h2>
        <CommitTimeline commits={commits} />
      </section>

      {/* Activity timestamps */}
      <section className="detail-section timestamps-section">
        <h2 className="section-title">Activity Sources</h2>
        <div className="timestamp-grid">
          <div className="ts-item">
            <span className="ts-label"><Icon name="drive" size={13} /> Local files</span>
            <span className="ts-value">
              {repo.last_file_modified_at 
                ? `${timeAgo(repo.last_file_modified_at)} (${new Date(repo.last_file_modified_at).toLocaleDateString()})` 
                : '—'}
            </span>
          </div>
          <div className="ts-item">
            <span className="ts-label"><Icon name="activity" size={13} /> Local git</span>
            <span className="ts-value">
              {repo.last_local_commit_at 
                ? `${timeAgo(repo.last_local_commit_at)} (${new Date(repo.last_local_commit_at).toLocaleDateString()})` 
                : '—'}
            </span>
          </div>
          <div className="ts-item">
            <span className="ts-label"><Icon name="globe" size={13} /> GitHub</span>
            <span className="ts-value">
              {(githubDate || repo.last_remote_push_at)
                ? `${timeAgo(githubDate || repo.last_remote_push_at!)} (${new Date(githubDate || repo.last_remote_push_at!).toLocaleDateString()})` 
                : '—'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
