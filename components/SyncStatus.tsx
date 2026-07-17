'use client';

import type { TrackedRepo } from '@/types/repo';

interface Props {
  repo: TrackedRepo;
}

export default function SyncStatus({ repo }: Props) {
  const { local_ahead_by, remote_ahead_by, is_diverged, uncommitted_changes } = repo.sync;

  if (!local_ahead_by && !remote_ahead_by && !uncommitted_changes && !is_diverged) {
    const localTs = repo.last_local_commit_at ? new Date(repo.last_local_commit_at).getTime() : 0;
    const remoteTs = repo.last_remote_push_at ? new Date(repo.last_remote_push_at).getTime() : 0;

    if (localTs > remoteTs && remoteTs > 0) {
      return <span className="sync-chip sync-ahead" title="Local version has newer commits not pushed to remote">↑ Local newer</span>;
    } else if (remoteTs > localTs && localTs > 0) {
      return <span className="sync-chip sync-behind" title="Remote version has newer commits not pulled locally">↓ Remote newer</span>;
    }

    return <span className="sync-chip sync-synced" title="In sync with remote">✓ Synced</span>;
  }

  return (
    <div className="sync-status-row">
      {is_diverged && (
        <span className="sync-chip sync-diverged" title="Branch has diverged from remote">⚡ Diverged</span>
      )}
      {local_ahead_by > 0 && !is_diverged && (
        <span className="sync-chip sync-ahead" title={`${local_ahead_by} local commit(s) not pushed`}>
          ↑ {local_ahead_by} ahead
        </span>
      )}
      {remote_ahead_by > 0 && !is_diverged && (
        <span className="sync-chip sync-behind" title={`${remote_ahead_by} remote commit(s) not pulled`}>
          ↓ {remote_ahead_by} behind
        </span>
      )}
      {uncommitted_changes > 0 && (
        <span className="sync-chip sync-dirty" title={`${uncommitted_changes} uncommitted file(s)`}>
          ~ {uncommitted_changes} uncommitted
        </span>
      )}
    </div>
  );
}
