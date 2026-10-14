// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type ProjectStatus = "pending" | "processing" | "completed" | "failed";
export type ClipStatus = "processing" | "ready" | "error";
export type DurationMode = "30" | "60" | "auto";
export type SourceType = "youtube" | "upload";

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  credits: number;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  video_url: string;
  source_type: SourceType;
  title: string;
  status: ProjectStatus;
  stage: string;
  progress: number;
  duration_mode: DurationMode;
  error: string | null;
  error_code: "youtube_blocked" | null;
  simulated: boolean;
  clips_count: number;
  created_at: string;
}

export interface Clip {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string;
  hook: string;
  start_time: number;
  end_time: number;
  viral_score: number;
  hashtags: string[];
  download_url: string | null;
  preview_url: string | null;
  source_url: string;
  source_type: SourceType;
  status: ClipStatus;
  error: string | null;
  simulated: boolean;
  created_at: string;
}

export interface ProjectActionResult {
  project: Project;
  credits: number;
  message: string;
}

export interface KeyStatus {
  service: "assemblyai" | "shotstack" | "openai";
  label: string;
  env_var: string;
  configured: boolean;
  valid: boolean;
  mode: "real" | "simulation" | "emergent";
  latency_ms: number | null;
  message: string;
}

export interface ConnectionsReport {
  keys: KeyStatus[];
  credits: number;
  simulation_active: boolean;
  checked_at: string;
}

export interface MessageOut {
  message: string;
}
