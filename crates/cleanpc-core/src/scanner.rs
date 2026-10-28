use crate::env::Env;
use crate::guard;
use crate::model::{ScanItem, ScanStatus};
use crate::rules::{self, Target};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub min_age_secs: u64,
    pub max_files: u64,
    pub max_depth: usize,
}

impl Default for ScanOptions {
    fn default() -> Self {
        ScanOptions { min_age_secs: 3600, max_files: 200_000, max_depth: 12 }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Progress {
    pub files_seen: u64,
    pub bytes_seen: u64,
}

#[derive(Debug)]
pub struct CategoryOutcome {
    pub status: ScanStatus,
    pub items: Vec<ScanItem>,
    pub files_found: u64,
    pub eligible_files: u64,
    pub total_bytes: u64,
    pub eligible_bytes: u64,
    pub warnings: Vec<String>,
}

pub fn age_ok(modified_ms: i64, min_age_secs: u64, now_ms: i64) -> bool {
    modified_ms > 0 && now_ms.saturating_sub(modified_ms) >= (min_age_secs as i64) * 1000
}

pub fn modified_ms_of(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn scan_category(
    id: &str,
    env: &Env,
    opts: &ScanOptions,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(Progress),
) -> CategoryOutcome {
    let mut out = CategoryOutcome {
        status: ScanStatus::Completed,
        items: Vec::new(),
        files_found: 0,
        eligible_files: 0,
        total_bytes: 0,
        eligible_bytes: 0,
        warnings: Vec::new(),
    };
    let targets = rules::targets(id, env);
    if targets.is_empty() {
        out.status = ScanStatus::Unavailable;
        out.warnings.push("Lokasi kategori ini tidak ditemukan di perangkat.".into());
        return out;
    }
    let now = crate::model::now_ms();
    let (mut denied, mut links, mut rejected, mut running_hit) = (0u64, 0u64, 0u64, false);
    let mut depth_limited = false;
    let mut prog = Progress::default();

    'targets: for tg in &targets {
        let root = match guard::validate_root(&tg.root, env) {
            Ok(r) => r,
            Err(_) => {
                rejected += 1;
                continue;
            }
        };
        let browser_running = tg.process.map(|p| env.is_running(p)).unwrap_or(false);
        running_hit |= browser_running;
        let mut stack: Vec<(PathBuf, usize)> = vec![(root, 0)];
        while let Some((dir, depth)) = stack.pop() {
            let rd = match fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => {
                    denied += 1;
                    continue;
                }
            };
            for entry in rd {
                if cancel.load(Ordering::Relaxed) {
                    out.status = ScanStatus::Cancelled;
                    break 'targets;
                }
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                let ft = match entry.file_type() {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                if ft.is_symlink() {
                    links += 1;
                    continue;
                }
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => {
                        denied += 1;
                        continue;
                    }
                };
                if guard::is_reparse(&meta) {
                    links += 1;
                    continue;
                }
                if meta.is_dir() {
                    if tg.recursive {
                        if depth < opts.max_depth {
                            stack.push((entry.path(), depth + 1));
                        } else {
                            depth_limited = true;
                        }
                    }
                    continue;
                }
                if !meta.is_file() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if !tg.filter.matches(&name) {
                    continue;
                }
                if out.items.len() as u64 >= opts.max_files {
                    out.warnings.push("Batas jumlah file per kategori tercapai; sebagian file tidak dipindai.".into());
                    break 'targets;
                }
                let (eligible, reason) = judge(tg, &name, &meta, browser_running, opts, now);
                let size = meta.len();
                out.files_found += 1;
                out.total_bytes += size;
                if eligible {
                    out.eligible_files += 1;
                    out.eligible_bytes += size;
                }
                out.items.push(ScanItem { path: entry.path(), size, modified_ms: modified_ms_of(&meta), eligible, reason });
                prog.files_seen += 1;
                prog.bytes_seen += size;
                if prog.files_seen % 400 == 0 {
                    on_progress(prog);
                }
            }
        }
    }
    on_progress(prog);
    if denied > 0 {
        out.warnings.push(format!("{denied} folder/file dilewati karena tidak ada izin akses atau terkunci."));
    }
    if links > 0 {
        out.warnings.push(format!("{links} tautan simbolik/reparse point dilewati dengan aman."));
    }
    if rejected > 0 {
        out.warnings.push(format!("{rejected} lokasi ditolak oleh kebijakan keamanan."));
    }
    if depth_limited {
        out.warnings.push("Kedalaman folder dibatasi; subfolder yang lebih dalam tidak dipindai.".into());
    }
    if running_hit {
        out.warnings.push("Browser sedang berjalan. Tutup browser agar cache dapat dibersihkan.".into());
    }
    out
}

fn judge(tg: &Target, name: &str, meta: &fs::Metadata, browser_running: bool, opts: &ScanOptions, now: i64) -> (bool, Option<String>) {
    if browser_running {
        return (false, Some("Browser sedang berjalan".into()));
    }
    if tg.exclude_personal && rules::is_personal(name) {
        return (false, Some("Jenis file dikecualikan (dokumen/kunci/media)".into()));
    }
    if !age_ok(modified_ms_of(meta), opts.min_age_secs, now) {
        return (false, Some(format!("Diubah kurang dari {} menit lalu", (opts.min_age_secs / 60).max(1))));
    }
    (true, None)
}
