use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Pending,
    Scanning,
    Completed,
    Cancelled,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub available: bool,
    pub warning: Option<String>,
}

/// Ringkasan hasil scan satu kategori (dikirim ke frontend).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub scan_id: String,
    pub category_id: String,
    pub category_name: String,
    /// File yang cocok dengan pola kategori dan dapat diakses.
    pub files_found: u64,
    /// Subset yang lolos seluruh aturan keamanan (boleh dihapus).
    pub eligible_files: u64,
    pub total_bytes: u64,
    pub eligible_bytes: u64,
    pub scan_status: ScanStatus,
    pub warnings: Vec<String>,
}

/// Item internal. Path TIDAK pernah dikirim ke frontend sebagai input penghapusan.
#[derive(Debug, Clone)]
pub struct ScanItem {
    pub path: PathBuf,
    pub size: u64,
    pub modified_ms: i64,
    pub eligible: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemView {
    pub id: u64,
    pub display_path: String,
    pub size: u64,
    pub modified_ms: i64,
    pub eligible: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorCount {
    pub reason: String,
    pub count: u64,
    /// "skipped" atau "failed"
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryClean {
    pub category_id: String,
    pub files_deleted: u64,
    pub bytes_deleted: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanReport {
    pub operation_id: String,
    pub files_attempted: u64,
    pub files_deleted: u64,
    pub files_skipped: u64,
    pub files_failed: u64,
    pub bytes_deleted: u64,
    pub errors: Vec<ErrorCount>,
    pub by_category: Vec<CategoryClean>,
    pub cancelled: bool,
    /// Unix epoch milidetik.
    pub completed_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub bytes: u64,
    pub files: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DirAnalysis {
    pub path: String,
    pub total_bytes: u64,
    pub total_files: u64,
    pub entries: Vec<DirEntryInfo>,
    pub skipped_dirs: u64,
    pub truncated: bool,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
