'use client';

import type { Commit } from '@/types/repo';
import { timeAgo } from '@/lib/resolver';

interface Props {
  commits: Commit[];
  repoName?: string;
}

export default function CommitTimeline({ commits, repoName }: Props) {
  if (!commits.length) {
    return <p className="timeline-empty">No commits found.</p>;
  }

  return (
    <div className="timeline">
      {repoName && <h3 className="timeline-repo-name">{repoName}</h3>}
      <ul className="timeline-list">
        {commits.slice(0, 30).map(commit => (
          <li key={commit.sha} className="timeline-item">
            <div className="timeline-dot" />
            <div className="timeline-content">
              <p className="timeline-message">{commit.message.split('\n')[0]}</p>
              <div className="timeline-meta">
                <span className="timeline-author">{commit.author.split('<')[0].trim()}</span>
                <span className="timeline-sep">·</span>
                <span className="timeline-time">{timeAgo(commit.committed_at)}</span>
                {commit.files_changed > 0 && (
                  <>
                    <span className="timeline-sep">·</span>
                    <span className="timeline-files">{commit.files_changed} file{commit.files_changed !== 1 ? 's' : ''}</span>
                  </>
                )}
                {(commit.insertions > 0 || commit.deletions > 0) && (
                  <>
                    <span className="timeline-additions">+{commit.insertions}</span>
                    <span className="timeline-deletions">−{commit.deletions}</span>
                  </>
                )}
              </div>
            </div>
            <code className="timeline-sha">{commit.sha.slice(0, 7)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
