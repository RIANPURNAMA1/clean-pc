use std::collections::HashSet;
use std::path::PathBuf;

/// Lingkungan sistem yang dapat disubstitusi pada pengujian.
#[derive(Debug, Clone, Default)]
pub struct Env {
    pub windir: Option<PathBuf>,
    pub temp: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
    pub user_profile: Option<PathBuf>,
    /// Nama proses berjalan (huruf kecil), contoh: "chrome.exe".
    pub running: HashSet<String>,
}

impl Env {
    pub fn from_system() -> Self {
        let var = |k: &str| std::env::var_os(k).map(PathBuf::from);
        Env {
            windir: var("WINDIR").or_else(|| var("SystemRoot")),
            temp: Some(std::env::temp_dir()),
            local_app_data: var("LOCALAPPDATA"),
            user_profile: var("USERPROFILE").or_else(|| var("HOME")),
            running: HashSet::new(),
        }
    }

    pub fn is_running(&self, exe: &str) -> bool {
        self.running.contains(&exe.to_lowercase())
    }
}
