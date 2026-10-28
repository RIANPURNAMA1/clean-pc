//! Mesin pembersihan. Setiap item DIVALIDASI ULANG sebelum dihapus.
use crate::env::Env;
use crate::guard;
use crate::model::{now_ms, CategoryClean, CleanReport, ErrorCount, ScanItem};
use crate::rules::{self, Target};
use crate::scanner::{age_ok, modified_ms_of};
use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone)]
pub struct CleanOptions {
    pub min_age_secs: u64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct CleanProgress {
    pub done: u64,
    pub total: u64,
    pub bytes_deleted: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Deleted(u64),
    Skipped(&'static str),
    Failed(&'static str),
}

type RootCache = BTreeMap<String, Vec<(Target, PathBuf)>>;

fn build_roots(category: &str, env: &Env, cache: &mut RootCache) {
    if cache.contains_key(category) {
        return;
    }
    let v = rules::targets(category, env)
        .into_iter()
        .filter_map(|t| guard::validate_root(&t.root, env).ok().map(|r| (t, r)))
        .collect();
    cache.insert(category.to_string(), v);
}

fn clean_one(category: &str, item: &ScanItem, env: &Env, opts: &CleanOptions, cache: &RootCache) -> Outcome {
    if !item.eligible {
        return Outcome::Skipped("Tidak memenuhi syarat saat scan");
    }
    let roots = match cache.get(category) {
        Some(r) if !r.is_empty() => r,
        _ => return Outcome::Skipped("Lokasi tidak lagi didukung"),
    };
    let meta = match fs::symlink_metadata(&item.path) {
        Ok(m) => m,
        Err(e) if e.kind() == ErrorKind::NotFound => return Outcome::Skipped("File sudah tidak ada"),
        Err(_) => return Outcome::Skipped("Tidak dapat diakses (izin ditolak)"),
    };
    if guard::is_reparse(&meta) {
        return Outcome::Skipped("Tautan simbolik dilewati");
    }
    if !meta.is_file() {
        return Outcome::Skipped("Bukan file biasa lagi");
    }
    let canon = match fs::canonicalize(&item.path) {
        Ok(c) => c,
        Err(_) => return Outcome::Skipped("Tidak dapat diverifikasi"),
    };
    let target = match roots.iter().find(|(_, root)| guard::is_within(&canon, root)) {
        Some(t) => t,
        None => return Outcome::Skipped("Di luar direktori yang diizinkan"),
    };
    let (tg, root) = (&target.0, &target.1);
    if !tg.recursive && canon.parent().map(|p| !guard::is_within(root, p) || !guard::is_within(p, root)).unwrap_or(true) {
        return Outcome::Skipped("Di luar direktori yang diizinkan");
    }
    let name = canon.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if !tg.filter.matches(&name) {
        return Outcome::Skipped("Pola file tidak sesuai");
    }
    if tg.exclude_personal && rules::is_personal(&name) {
        return Outcome::Skipped("Jenis file dikecualikan");
    }
    if tg.process.map(|p| env.is_running(p)).unwrap_or(false) {
        return Outcome::Skipped("Browser sedang berjalan");
    }
    if meta.len() != item.size || modified_ms_of(&meta) != item.modified_ms {
        return Outcome::Skipped("File berubah sejak scan");
    }
    if !age_ok(item.modified_ms, opts.min_age_secs, now_ms()) {
        return Outcome::Skipped("File baru saja diubah");
    }
    match fs::remove_file(&canon) {
        Ok(()) => Outcome::Deleted(item.size),
        Err(e) => match e.kind() {
            ErrorKind::NotFound => Outcome::Skipped("File sudah tidak ada"),
            ErrorKind::PermissionDenied => Outcome::Skipped("File terkunci atau butuh izin lebih tinggi"),
            _ => match e.raw_os_error() {
                Some(5) | Some(32) | Some(33) => Outcome::Skipped("File terkunci atau sedang digunakan"),
                _ => Outcome::Failed("Gagal menghapus file"),
            },
        },
    }
}

/// `items`: pasangan (category_id, item). Progress dilaporkan per file.
pub fn clean(
    operation_id: &str,
    items: &[(String, ScanItem)],
    env: &Env,
    opts: &CleanOptions,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(CleanProgress),
) -> CleanReport {
    let mut cache = RootCache::new();
    let total = items.len() as u64;
    let (mut attempted, mut deleted, mut skipped, mut failed, mut bytes) = (0u64, 0u64, 0u64, 0u64, 0u64);
    let mut errs: BTreeMap<(&'static str, bool), u64> = BTreeMap::new();
    let mut per_cat: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    let mut cancelled = false;

    for (i, (cat, item)) in items.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        build_roots(cat, env, &mut cache);
        attempted += 1;
        match clean_one(cat, item, env, opts, &cache) {
            Outcome::Deleted(sz) => {
                deleted += 1;
                bytes += sz;
                let e = per_cat.entry(cat.clone()).or_default();
                e.0 += 1;
                e.1 += sz;
            }
            Outcome::Skipped(r) => {
                skipped += 1;
                *errs.entry((r, false)).or_default() += 1;
            }
            Outcome::Failed(r) => {
                failed += 1;
                *errs.entry((r, true)).or_default() += 1;
            }
        }
        if (i as u64 + 1) % 50 == 0 {
            on_progress(CleanProgress { done: i as u64 + 1, total, bytes_deleted: bytes });
        }
    }
    on_progress(CleanProgress { done: attempted, total, bytes_deleted: bytes });
    CleanReport {
        operation_id: operation_id.to_string(),
        files_attempted: attempted,
        files_deleted: deleted,
        files_skipped: skipped,
        files_failed: failed,
        bytes_deleted: bytes,
        errors: errs
            .into_iter()
            .map(|((reason, is_fail), count)| ErrorCount {
                reason: reason.to_string(),
                count,
                kind: if is_fail { "failed" } else { "skipped" }.to_string(),
            })
            .collect(),
        by_category: per_cat
            .into_iter()
            .map(|(category_id, (files_deleted, bytes_deleted))| CategoryClean { category_id, files_deleted, bytes_deleted })
            .collect(),
        cancelled,
        completed_at: now_ms(),
    }
}
