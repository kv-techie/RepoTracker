// Metrics and scoring types — all explainable (rules §9).

export type MomentumLevel = 'growing' | 'stable' | 'declining';
export type StalenessRisk = 'low' | 'moderate' | 'high' | 'critical';
export type HealthLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export interface HealthBreakdown {
  base_score: number;
  commit_recency_bonus: number;
  readme_bonus: number;
  stale_branch_penalty: number;
  uncommitted_penalty: number;
  no_activity_penalty: number;
  reasons: string[];
}

export interface HealthScore {
  score: number;
  breakdown: HealthBreakdown;
  level: HealthLevel;
}

export interface MomentumScore {
  level: MomentumLevel;
  commit_count_last_4w: number;
  commit_count_prev_4w: number;
  change_pct: number;
  reason: string;
}

export interface StalenessInfo {
  risk: StalenessRisk;
  days_since_activity: number;
  days_until_stale: number;
  days_until_dead: number;
  message: string;
}

export interface ReadmeScore {
  score: number;
  has_readme: boolean;
  has_description: boolean;
  has_installation: boolean;
  has_usage: boolean;
  has_license: boolean;
  missing_sections: string[];
  badge_suggestions: string[];
}

export interface LargeFile {
  path: string;
  size_bytes: number;
  language: string;
}

export interface HotspotFile {
  path: string;
  change_count: number;
  last_modified: string;
}

export interface FileIntelligence {
  total_files: number;
  total_lines: number;
  large_files: LargeFile[];
  hotspots: HotspotFile[];
  recently_modified: string[];
}

// Legacy types kept for backward compatibility
export interface ProgressMetrics {
  repoName: string;
  totalLines: number;
  commitCount: number;
  activityScore: number;
  healthScore: number;
  lastUpdateDate: string;
  estimatedCompletion?: string;
}

export interface ActivityScore {
  score: number;
  level: 'critical' | 'low' | 'moderate' | 'high' | 'very-high';
  lastCommitAge: number;
  frequencyTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface FileMetrics {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  largestFiles: Array<{ path: string; lines: number; language: string }>;
}
