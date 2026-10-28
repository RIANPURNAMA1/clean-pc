//! Analisis ukuran direktori (hanya baca). Tidak mengikuti symlink/reparse point.
use crate::guard;
use crate::model::{DirAnalysis, DirEntryInfo};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub struct AnalyzeOptions {
    pub max_depth: usize,
    pub max_entries: u64,
    pub time_limit: Duration,
}

impl Default for AnalyzeOptions {
    fn default() -> Self {
        AnalyzeOptions { max_depth: 8, max_entries: 1_000_000, time_limit: Duration::from_secs(40) }
    }
}

pub fn analyze_dir(path: &Path, opts: &AnalyzeOptions, cancel: &AtomicBool) -> Result<DirAnalysis, String> {
    let canon = fs::canonicalize(path).map_err(|_| "Folder tidak ditemukan atau tidak dapat diakses.".to_string())?;
    if !canon.is_dir() {
        return Err("Path yang dipilih bukan folder.".into());
    }
    let start = Instant::now();
    let mut seen = 0u64;
    let mut skipped = 0u64;
    let mut truncated = false;
    let (mut total_bytes, mut total_files) = (0u64, 0u64);
    let mut entries = Vec::new();

    let rd = fs::read_dir(&canon).map_err(|_| "Tidak ada izin untuk membaca folder ini.".to_string())?;
    'top: for e in rd.flatten() {
        let Ok(meta) = e.metadata() else { skipped += 1; continue };
        if guard::is_reparse(&meta) {
            skipped += 1;
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if meta.is_file() {
            seen += 1;
            total_bytes += meta.len();
            total_files += 1;
            entries.push(DirEntryInfo { name, is_dir: false, bytes: meta.len(), files: 1 });
            continue;
        }
        if !meta.is_dir() {
            continue;
        }
        let (mut bytes, mut files) = (0u64, 0u64);
        let mut stack: Vec<(PathBuf, usize)> = vec![(e.path(), 1)];
        while let Some((dir, depth)) = stack.pop() {
            if cancel.load(Ordering::Relaxed) || start.elapsed() > opts.time_limit || seen >= opts.max_entries {
                truncated = true;
                total_bytes += bytes;
                total_files += files;
                entries.push(DirEntryInfo { name, is_dir: true, bytes, files });
                break 'top;
            }
            let Ok(rd) = fs::read_dir(&dir) else { skipped += 1; continue };
            for c in rd.flatten() {
                let Ok(m) = c.metadata() else { skipped += 1; continue };
                if guard::is_reparse(&m) {
                    skipped += 1;
                    continue;
                }
                seen += 1;
                if m.is_file() {
                    bytes += m.len();
                    files += 1;
                } else if m.is_dir() {
                    if depth < opts.max_depth {
                        stack.push((c.path(), depth + 1));
                    } else {
                        truncated = true;
                    }
                }
            }
        }
        total_bytes += bytes;
        total_files += files;
        entries.push(DirEntryInfo { name, is_dir: true, bytes, files });
    }
    entries.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    entries.truncate(200);
    Ok(DirAnalysis {
        path: canon.to_string_lossy().trim_start_matches(r"\\?\").to_string(),
        total_bytes,
        total_files,
        entries,
        skipped_dirs: skipped,
        truncated,
    })
}
