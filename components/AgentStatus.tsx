'use client';

import type { AgentStatus } from '@/types/agent';
import { timeAgo } from '@/lib/resolver';
import { useState } from 'react';

interface Props {
  status: AgentStatus;
  onScan?: () => void;
}

export default function AgentStatusBar({ status, onScan }: Props) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!onScan || syncing) return;
    setSyncing(true);
    await onScan();
    // Keep spinner for 1.5 s so the user sees feedback
    setTimeout(() => setSyncing(false), 1500);
  };

  return (
    <div className={`agent-status-bar ${status.online ? 'agent-online' : 'agent-offline'}`}>
      {/* Status dot + label */}
      <div className="agent-indicator">
        <span className={`agent-dot ${status.online ? 'dot-online' : 'dot-offline'}`} />
        <span className="agent-text">
          Agent {status.online ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Inline meta */}
      {status.online && (
        <div className="agent-meta">
          <span className="agent-repos">{status.repo_count} repos</span>
          <span className="agent-sep">·</span>
          <span className="agent-scan">
            Last scan: {status.last_scan ? timeAgo(status.last_scan) : 'Never'}
          </span>
          <span className="agent-sep">·</span>
          <span className="agent-watching">
            {status.watching_folder_count} folder{status.watching_folder_count !== 1 ? 's' : ''} watched
          </span>
        </div>
      )}

      {/* Offline hint */}
      {!status.online && (
        <span className="agent-hint">
          Run <code>python agent/main.py</code> to enable local scanning
        </span>
      )}

      {/* Sync pill — flush right, visually part of the bar */}
      {onScan && status.online && (
        <button
          className={`agent-sync-pill${syncing ? ' agent-sync-pill--syncing' : ''}`}
          onClick={handleSync}
          disabled={syncing}
          id="trigger-scan-btn"
          title="Sync repositories now"
        >
          <svg
            className="sync-icon"
            width="13" height="13"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      )}
    </div>
  );
}
