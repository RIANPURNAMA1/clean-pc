use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub theme: String,
    pub language: String,
    pub confirm_before_clean: bool,
    pub enabled_categories: Vec<String>,
    pub min_age_minutes: u64,
    pub max_files_per_category: u64,
    pub max_scan_depth: u32,
    pub history_retention_days: u32,
    pub clean_browser_cache: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".into(),
            language: "id".into(),
            confirm_before_clean: true,
            enabled_categories: crate::rules::DEFS.iter().map(|d| d.id.to_string()).collect(),
            min_age_minutes: 60,
            max_files_per_category: 200_000,
            max_scan_depth: 12,
            history_retention_days: 90,
            clean_browser_cache: true,
        }
    }
}

impl Settings {
    pub fn sanitize(&mut self) {
        if self.theme != "light" && self.theme != "dark" {
            self.theme = "dark".into();
        }
        self.language = "id".into();
        self.min_age_minutes = self.min_age_minutes.clamp(0, 60 * 24 * 30);
        self.max_files_per_category = self.max_files_per_category.clamp(1_000, 1_000_000);
        self.max_scan_depth = self.max_scan_depth.clamp(1, 20);
        self.history_retention_days = self.history_retention_days.clamp(1, 3650);
        self.enabled_categories.retain(|c| crate::rules::def(c).is_some());
    }
}

/// Riwayat TIDAK menyimpan path atau isi file; hanya angka dan alasan ringkas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,
    pub timestamp_ms: i64,
    pub categories: Vec<String>,
    pub files_found: u64,
    pub bytes_found: u64,
    pub files_deleted: u64,
    pub bytes_deleted: u64,
    pub files_skipped: u64,
    pub files_failed: u64,
    pub failure_reasons: Vec<String>,
}

pub struct Store {
    pub dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        Store { dir }
    }

    fn write_atomic(&self, name: &str, data: &str) -> Result<(), String> {
        let tmp = self.dir.join(format!("{name}.tmp"));
        fs::write(&tmp, data).map_err(|e| e.to_string())?;
        fs::rename(&tmp, self.dir.join(name)).map_err(|e| e.to_string())
    }

    pub fn load_settings(&self) -> Settings {
        let mut s: Settings = fs::read_to_string(self.dir.join("settings.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        s.sanitize();
        s
    }

    pub fn save_settings(&self, mut s: Settings) -> Result<Settings, String> {
        s.sanitize();
        self.write_atomic("settings.json", &serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?)?;
        Ok(s)
    }

    pub fn load_history(&self) -> Vec<HistoryEntry> {
        fs::read_to_string(self.dir.join("history.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    }

    pub fn append_history(&self, e: HistoryEntry, retention_days: u32) -> Result<(), String> {
        let mut h = self.load_history();
        h.push(e);
        let cutoff = crate::model::now_ms() - (retention_days as i64) * 86_400_000;
        h.retain(|x| x.timestamp_ms >= cutoff);
        self.write_atomic("history.json", &serde_json::to_string(&h).map_err(|e| e.to_string())?)
    }

    pub fn clear_history(&self) -> Result<(), String> {
        self.write_atomic("history.json", "[]")
    }
}
