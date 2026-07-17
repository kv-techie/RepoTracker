// Agent-specific types for status, events, and config.

export interface AgentStatus {
  online: boolean;
  version: string;
  last_scan?: string;
  watching_folders: string[];
  db_path: string;
  repo_count: number;
  ai_enabled: boolean;
}

export interface ScanResult {
  repos_found: number;
  duration_ms: number;
  scanned_at: string;
}

export interface AgentConfig {
  watched_folders: string[];
  scan_interval_seconds: number;
  stale_threshold_days: number;
  dead_threshold_days: number;
  github_pat?: string;
  ai_enabled: boolean;
  ai_mode: 'auto' | 'ollama' | 'gemini' | 'disabled';
  gemini_api_key?: string;
  gemini_key_set?: boolean;
  ollama_model?: string;
  agent_port: number;
}

export interface AgentConfigUpdate {
  watched_folders?: string[];
  scan_interval_seconds?: number;
  stale_threshold_days?: number;
  dead_threshold_days?: number;
  github_pat?: string;
  ai_enabled?: boolean;
  ai_mode?: 'auto' | 'ollama' | 'gemini' | 'disabled';
  gemini_api_key?: string;
  ollama_model?: string;
}

export interface FileEvent {
  file_path: string;
  event_type: 'modified' | 'created' | 'deleted';
  occurred_at: string;
  repo_id: string;
}

export interface AiQueryResponse {
  answer: string;
}

export interface WeeklySummaryResponse {
  summary: string;
  ai_enabled: boolean;
}
