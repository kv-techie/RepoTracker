'use client';

import type { TrackedRepo } from '@/types/repo';
import Icon, { type IconName } from './Icon';

interface Props {
  repo: TrackedRepo;
}

function Chip({ tone, icon, label, title }: { tone: string; icon: IconName; label: string; title: string }) {
  return (
    <span className={`sync-chip sync-${tone}`} title={title}>
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}

export default function SyncStatus({ repo }: Props) {
  const { local_ahead_by, remote_ahead_by, is_diverged, uncommitted_changes, upstream } = repo.sync;

  if (!local_ahead_by && !remote_ahead_by && !uncommitted_changes && !is_diverged) {
    const localTs = repo.last_local_commit_at ? new Date(repo.last_local_commit_at).getTime() : 0;
    const remoteTs = repo.last_remote_push_at ? new Date(repo.last_remote_push_at).getTime() : 0;

    if (localTs > remoteTs && remoteTs > 0) {
      return <Chip tone="ahead" icon="arrow-up" label="Local newer" title="Local commits are newer than the remote's" />;
    }
    if (remoteTs > localTs && localTs > 0) {
      return <Chip tone="behind" icon="download" label="Remote newer" title="The remote has commits you have not pulled" />;
    }
    return (
      <Chip
        tone="synced"
        icon="check"
        label={upstream ? 'In sync' : 'No upstream'}
        title={upstream ? `Matches ${upstream}` : 'This branch does not track a remote branch'}
      />
    );
  }

  return (
    <div className="sync-status-row">
      {is_diverged && (
        <Chip tone="diverged" icon="alert" label="Diverged" title="Local and remote have both moved on" />
      )}
      {local_ahead_by > 0 && !is_diverged && (
        <Chip tone="ahead" icon="arrow-up" label={`${local_ahead_by} ahead`} title={`${local_ahead_by} commit(s) not pushed`} />
      )}
      {remote_ahead_by > 0 && !is_diverged && (
        <Chip tone="behind" icon="download" label={`${remote_ahead_by} behind`} title={`${remote_ahead_by} commit(s) not pulled`} />
      )}
      {uncommitted_changes > 0 && (
        <Chip
          tone="dirty"
          icon="activity"
          label={`${uncommitted_changes} uncommitted`}
          title={`${uncommitted_changes} file(s) changed but not committed`}
        />
      )}
    </div>
  );
}
