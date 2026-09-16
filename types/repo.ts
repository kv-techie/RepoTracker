// Core repo type extended for hybrid local+remote tracking.

export type LatestSource = 'local_filesystem' | 'local_git' | 'github_remote';
export type SourceType = 'local_only' | 'github' | 'hybrid';
export type FilterTag = 'active' | 'stale' | 'unpushed' | 'local_only' | 'broken' | 'deployed' | 'missing';

export interface SyncStatus {
  local_ahead_by: number;
  remote_ahead_by: number;
  is_diverged: boolean;
  uncommitted_changes: number;
  has_stash: boolean;
  upstream?: string | null;
}

export interface Repo {
  id: string;
  name: string;
  remote_url?: string;
  source_type: SourceType;
  latest_source: LatestSource;

  current_branch: string;
  default_branch: string;
  is_private: boolean;
  description?: string;
  language?: string;
  topics: string[];

  last_local_commit_at?: string;
  last_remote_push_at?: string;
  last_file_modified_at?: string;
  latest_activity_at?: string;

  sync: SyncStatus;

  github_stars: number;
  github_forks: number;

  tags: FilterTag[];
  collection?: string;

  created_at: string;
  updated_at: string;
}

export interface TrackedRepo extends Repo {
  health?: import('./metrics').HealthScore;
  momentum?: import('./metrics').MomentumScore;
  staleness?: import('./metrics').StalenessInfo;
  readme?: import('./metrics').ReadmeScore;
  file_intelligence?: import('./metrics').FileIntelligence;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  committed_at: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  repo_id: string;
}
