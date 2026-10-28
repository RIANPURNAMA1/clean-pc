// Tipe ini mencerminkan model Rust (crates/cleanpc-core/src/model.rs dan commands.rs).
// Ukuran byte adalah u64 di Rust; JSON number aman hingga 2^53 byte (~9 PB).

export type ScanStatus = 'pending' | 'scanning' | 'completed' | 'cancelled' | 'unavailable'

export interface CategoryInfo {
  id: string
  name: string
  description: string
  available: boolean
  warning: string | null
}

export interface ScanResult {
  scan_id: string
  category_id: string
  category_name: string
  files_found: number
  eligible_files: number
  total_bytes: number
  eligible_bytes: number
  scan_status: ScanStatus
  warnings: string[]
}

export interface ItemView {
  id: number
  display_path: string
  size: number
  modified_ms: number
  eligible: boolean
  reason: string | null
}
export interface ItemPage {
  total: number
  items: ItemView[]
}

export interface ErrorCount {
  reason: string
  count: number
  kind: 'skipped' | 'failed'
}
export interface CleanReport {
  operation_id: string
  files_attempted: number
  files_deleted: number
  files_skipped: number
  files_failed: number
  bytes_deleted: number
  errors: ErrorCount[]
  by_category: { category_id: string; files_deleted: number; bytes_deleted: number }[]
  cancelled: boolean
  completed_at: number
}

export interface DriveInfo {
  name: string
  mount_point: string
  file_system: string
  total_bytes: number
  available_bytes: number
  used_bytes: number
  is_removable: boolean
}
export interface SystemInfo {
  os_name: string | null
  os_version: string | null
  device_name: string | null
  cpu_usage: number | null
  cpu_cores: number | null
  memory_total: number
  memory_available: number | null
  drives: DriveInfo[]
  primary_drive: string | null
}

export interface DirEntryInfo {
  name: string
  is_dir: boolean
  bytes: number
  files: number
}
export interface DirAnalysis {
  path: string
  total_bytes: number
  total_files: number
  entries: DirEntryInfo[]
  skipped_dirs: number
  truncated: boolean
}
export interface KnownFolder {
  label: string
  path: string
}

export interface HistoryEntry {
  id: string
  kind: 'scan' | 'clean'
  timestamp_ms: number
  categories: string[]
  files_found: number
  bytes_found: number
  files_deleted: number
  bytes_deleted: number
  files_skipped: number
  files_failed: number
  failure_reasons: string[]
}

export interface Settings {
  theme: 'dark' | 'light'
  language: string
  confirm_before_clean: boolean
  enabled_categories: string[]
  min_age_minutes: number
  max_files_per_category: number
  max_scan_depth: number
  history_retention_days: number
  clean_browser_cache: boolean
}

export interface AppInfo {
  name: string
  version: string
  tauri_version: string
  os: string
}

export interface ScanProgressEvent {
  scan_id: string
  category_id: string
  index: number
  total: number
  files_seen: number
  bytes_seen: number
  result: ScanResult | null
}
export interface ScanDoneEvent {
  scan_id: string
  cancelled: boolean
  results: ScanResult[]
}
export interface CleanProgressEvent {
  operation_id: string
  done: number
  total: number
  bytes_deleted: number
}
export interface SessionStatus {
  scan_id: string
  reviewed: boolean
  results: ScanResult[]
}

export type PageId = 'dashboard' | 'cleaner' | 'storage' | 'health' | 'history' | 'settings' | 'about'
