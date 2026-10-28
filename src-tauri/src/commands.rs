use crate::state::AppState;
use cleanpc_core::analyzer::{analyze_dir, AnalyzeOptions};
use cleanpc_core::cleaner::{self, CleanOptions};
use cleanpc_core::model::{now_ms, CategoryInfo, CleanReport, DirAnalysis, ItemView, ScanResult, ScanStatus};
use cleanpc_core::scanner::{scan_category, ScanOptions};
use cleanpc_core::session::{require_clean_allowed, ScanSession};
use cleanpc_core::store::{HistoryEntry, Settings, Store};
use cleanpc_core::{rules, Env, ScanItem};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use sysinfo::{Disks, ProcessesToUpdate, System, MINIMUM_CPU_UPDATE_INTERVAL};
use tauri::{AppHandle, Emitter, Manager, State};

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn store(app: &AppHandle) -> Result<Store, String> {
    let dir = app.path().app_data_dir().map_err(|_| "Folder data aplikasi tidak tersedia.".to_string())?;
    Ok(Store::new(dir))
}

/// Env sistem + daftar proses berjalan (untuk mendeteksi browser aktif).
fn env_snapshot(state: &AppState) -> Env {
    let mut env = Env::from_system();
    let mut sys = lock(&state.sys);
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let names: HashSet<String> = sys.processes().values().map(|p| p.name().to_string_lossy().to_lowercase()).collect();
    env.running = names;
    env
}

fn display_path(path: &Path, env: &Env) -> String {
    let s = path.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    for (base, label) in [(&env.user_profile, "%USERPROFILE%"), (&env.windir, "%WINDIR%")] {
        if let Some(b) = base {
            let b = b.to_string_lossy().to_string();
            if s.len() >= b.len() && s[..b.len()].eq_ignore_ascii_case(&b) {
                return format!("{label}{}", &s[b.len()..]);
            }
        }
    }
    s
}

// ---------- Info aplikasi & sistem ----------

#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    tauri_version: &'static str,
    os: &'static str,
}

#[tauri::command]
pub async fn app_info() -> Result<AppInfo, String> {
    Ok(AppInfo { name: "CleanPC", version: env!("CARGO_PKG_VERSION"), tauri_version: tauri::VERSION, os: std::env::consts::OS })
}

#[derive(Serialize)]
pub struct DriveInfo {
    name: String,
    mount_point: String,
    file_system: String,
    total_bytes: u64,
    available_bytes: u64,
    used_bytes: u64,
    is_removable: bool,
}

fn collect_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut v: Vec<DriveInfo> = disks
        .list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| DriveInfo {
            name: d.name().to_string_lossy().to_string(),
            mount_point: d.mount_point().to_string_lossy().to_string(),
            file_system: d.file_system().to_string_lossy().to_string(),
            total_bytes: d.total_space(),
            available_bytes: d.available_space(),
            used_bytes: d.total_space().saturating_sub(d.available_space()),
            is_removable: d.is_removable(),
        })
        .collect();
    v.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    v
}

#[derive(Serialize)]
pub struct SystemInfo {
    os_name: Option<String>,
    os_version: Option<String>,
    device_name: Option<String>,
    cpu_usage: Option<f32>,
    cpu_cores: Option<usize>,
    memory_total: u64,
    memory_available: Option<u64>,
    drives: Vec<DriveInfo>,
    primary_drive: Option<String>,
}

fn build_system_info(sys: &System, cpu_usage: Option<f32>) -> SystemInfo {
    let drives = collect_drives();
    let sysdrive = std::env::var("SystemDrive").ok().map(|d| format!("{d}\\").to_lowercase());
    let primary = drives
        .iter()
        .find(|d| Some(d.mount_point.to_lowercase()) == sysdrive)
        .or_else(|| drives.iter().find(|d| d.mount_point == "/"))
        .or_else(|| drives.first())
        .map(|d| d.mount_point.clone());
    SystemInfo {
        os_name: System::name(),
        os_version: System::long_os_version().or_else(System::os_version),
        device_name: System::host_name(),
        cpu_usage,
        cpu_cores: if sys.cpus().is_empty() { None } else { Some(sys.cpus().len()) },
        memory_total: sys.total_memory(),
        memory_available: if sys.total_memory() > 0 { Some(sys.available_memory()) } else { None },
        drives,
        primary_drive: primary,
    }
}

#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = lock(&state.sys);
    sys.refresh_memory();
    Ok(build_system_info(&sys, None))
}

/// Statistik langsung untuk PC Health. Pemakaian CPU membutuhkan dua sampel,
/// sampel pertama diambil dengan jeda minimum yang disarankan sysinfo.
#[tauri::command]
pub async fn get_live_stats(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = lock(&state.sys);
    if sys.cpus().is_empty() {
        sys.refresh_cpu_usage();
        std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    }
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let usage = if sys.cpus().is_empty() { None } else { Some(sys.global_cpu_usage()) };
    Ok(build_system_info(&sys, usage))
}

// ---------- Kategori & scan ----------

#[tauri::command]
pub async fn list_categories(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<CategoryInfo>, String> {
    let settings = store(&app)?.load_settings();
    let env = env_snapshot(&state);
    Ok(rules::DEFS
        .iter()
        .map(|d| {
            let mut available = !rules::targets(d.id, &env).is_empty();
            let mut warning = None;
            if d.id == "browser_cache" {
                if !settings.clean_browser_cache {
                    available = false;
                    warning = Some("Dinonaktifkan di Pengaturan.".to_string());
                } else if env.running.iter().any(|p| ["chrome.exe", "msedge.exe", "brave.exe", "firefox.exe"].contains(&p.as_str())) {
                    warning = Some("Ada browser yang sedang berjalan. Tutup browser agar cache dapat dibersihkan.".to_string());
                }
            }
            if d.id == "windows_temp" {
                warning = Some("Sebagian file butuh hak administrator dan akan dilewati.".to_string());
            }
            if !available && warning.is_none() {
                warning = Some("Lokasi tidak ditemukan di perangkat ini.".to_string());
            }
            CategoryInfo { id: d.id.into(), name: d.name.into(), description: d.description.into(), available, warning }
        })
        .collect())
}

#[derive(Serialize, Clone)]
struct ScanProgressEvent {
    scan_id: String,
    category_id: String,
    index: usize,
    total: usize,
    files_seen: u64,
    bytes_seen: u64,
    result: Option<ScanResult>,
}

#[derive(Serialize, Clone)]
struct ScanDoneEvent {
    scan_id: String,
    cancelled: bool,
    results: Vec<ScanResult>,
}

fn try_busy(state: &AppState) -> Result<(), String> {
    state
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map(|_| ())
        .map_err(|_| "Operasi lain sedang berjalan. Tunggu hingga selesai.".to_string())
}

#[tauri::command]
pub async fn start_scan(app: AppHandle, state: State<'_, AppState>, category_ids: Vec<String>) -> Result<String, String> {
    let st = store(&app)?;
    let settings = st.load_settings();
    let mut ids: Vec<String> = Vec::new();
    for id in category_ids {
        if rules::def(&id).is_none() {
            return Err("Kategori tidak dikenal.".into());
        }
        if id == "browser_cache" && !settings.clean_browser_cache {
            continue;
        }
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    if ids.is_empty() {
        return Err("Pilih minimal satu kategori yang aktif.".into());
    }
    try_busy(&state)?;
    let env = env_snapshot(&state);
    *lock(&state.session) = None;
    let scan_id = format!("scan-{}", now_ms());
    let cancel = Arc::new(AtomicBool::new(false));
    *lock(&state.scan_cancel) = Some(cancel.clone());
    let (app2, sid) = (app.clone(), scan_id.clone());
    std::thread::spawn(move || {
        let state = app2.state::<AppState>();
        run_scan(&app2, &state, &sid, &ids, &settings, &env, &cancel);
        state.busy.store(false, Ordering::SeqCst);
    });
    Ok(scan_id)
}

fn run_scan(app: &AppHandle, state: &AppState, scan_id: &str, ids: &[String], settings: &Settings, env: &Env, cancel: &AtomicBool) {
    let opts = ScanOptions {
        min_age_secs: settings.min_age_minutes * 60,
        max_files: settings.max_files_per_category,
        max_depth: settings.max_scan_depth as usize,
    };
    let mut results = Vec::new();
    let mut items_map: HashMap<String, Vec<ScanItem>> = HashMap::new();
    let mut cancelled = false;
    for (index, id) in ids.iter().enumerate() {
        let name = rules::def(id).map(|d| d.name).unwrap_or("");
        let mut last = Instant::now() - Duration::from_secs(1);
        let (app_p, sid, cid) = (app.clone(), scan_id.to_string(), id.clone());
        let total = ids.len();
        let mut on_progress = |p: cleanpc_core::scanner::Progress| {
            if last.elapsed() >= Duration::from_millis(120) {
                last = Instant::now();
                let _ = app_p.emit(
                    "scan_progress",
                    ScanProgressEvent { scan_id: sid.clone(), category_id: cid.clone(), index, total, files_seen: p.files_seen, bytes_seen: p.bytes_seen, result: None },
                );
            }
        };
        let out = scan_category(id, env, &opts, cancel, &mut on_progress);
        let result = ScanResult {
            scan_id: scan_id.to_string(),
            category_id: id.clone(),
            category_name: name.to_string(),
            files_found: out.files_found,
            eligible_files: out.eligible_files,
            total_bytes: out.total_bytes,
            eligible_bytes: out.eligible_bytes,
            scan_status: out.status,
            warnings: out.warnings.clone(),
        };
        let _ = app.emit(
            "scan_progress",
            ScanProgressEvent { scan_id: scan_id.to_string(), category_id: id.clone(), index, total: ids.len(), files_seen: out.files_found, bytes_seen: out.total_bytes, result: Some(result.clone()) },
        );
        let was_cancelled = out.status == ScanStatus::Cancelled;
        items_map.insert(id.clone(), out.items);
        results.push(result);
        if was_cancelled {
            cancelled = true;
            break;
        }
    }
    if !cancelled {
        if let Ok(st) = store(app) {
            let _ = st.append_history(
                HistoryEntry {
                    id: scan_id.to_string(),
                    kind: "scan".into(),
                    timestamp_ms: now_ms(),
                    categories: ids.to_vec(),
                    files_found: results.iter().map(|r| r.files_found).sum(),
                    bytes_found: results.iter().map(|r| r.total_bytes).sum(),
                    files_deleted: 0,
                    bytes_deleted: 0,
                    files_skipped: 0,
                    files_failed: 0,
                    failure_reasons: vec![],
                },
                settings.history_retention_days,
            );
        }
        *lock(&state.session) = Some(ScanSession { scan_id: scan_id.to_string(), results: results.clone(), items: items_map, reviewed: false });
    }
    let _ = app.emit("scan_done", ScanDoneEvent { scan_id: scan_id.to_string(), cancelled, results });
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(c) = lock(&state.scan_cancel).as_ref() {
        c.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ItemPage {
    total: usize,
    items: Vec<ItemView>,
}

#[tauri::command]
pub async fn get_scan_items(
    state: State<'_, AppState>,
    scan_id: String,
    category_id: String,
    sort_by: String,
    descending: bool,
    offset: usize,
    limit: usize,
) -> Result<ItemPage, String> {
    let env = Env::from_system();
    let guard = lock(&state.session);
    let s = guard.as_ref().filter(|s| s.scan_id == scan_id).ok_or("Hasil scan tidak ditemukan atau sudah kedaluwarsa.")?;
    let items = s.items.get(&category_id).ok_or("Kategori tidak ada pada hasil scan.")?;
    let mut idx: Vec<usize> = (0..items.len()).collect();
    match sort_by.as_str() {
        "modified" => idx.sort_by_key(|&i| items[i].modified_ms),
        "path" => idx.sort_by(|&a, &b| items[a].path.cmp(&items[b].path)),
        "status" => idx.sort_by_key(|&i| items[i].eligible),
        _ => idx.sort_by_key(|&i| items[i].size),
    }
    if descending {
        idx.reverse();
    }
    let limit = limit.clamp(1, 500);
    let page = idx
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|i| ItemView {
            id: i as u64,
            display_path: display_path(&items[i].path, &env),
            size: items[i].size,
            modified_ms: items[i].modified_ms,
            eligible: items[i].eligible,
            reason: items[i].reason.clone(),
        })
        .collect();
    Ok(ItemPage { total: items.len(), items: page })
}

#[tauri::command]
pub async fn mark_reviewed(state: State<'_, AppState>, scan_id: String) -> Result<(), String> {
    match lock(&state.session).as_mut() {
        Some(s) if s.scan_id == scan_id => {
            s.reviewed = true;
            Ok(())
        }
        _ => Err("Hasil scan tidak ditemukan atau sudah kedaluwarsa.".into()),
    }
}

#[derive(Serialize)]
pub struct SessionStatus {
    scan_id: String,
    reviewed: bool,
    results: Vec<ScanResult>,
}

#[tauri::command]
pub async fn session_status(state: State<'_, AppState>) -> Result<Option<SessionStatus>, String> {
    Ok(lock(&state.session).as_ref().map(|s| SessionStatus { scan_id: s.scan_id.clone(), reviewed: s.reviewed, results: s.results.clone() }))
}

// ---------- Pembersihan ----------

#[derive(Serialize, Clone)]
struct CleanProgressEvent {
    operation_id: String,
    done: u64,
    total: u64,
    bytes_deleted: u64,
}

#[tauri::command]
pub async fn start_clean(
    app: AppHandle,
    state: State<'_, AppState>,
    scan_id: String,
    category_ids: Vec<String>,
    confirmed: bool,
) -> Result<String, String> {
    let (items, bytes_attempted) = {
        let guard = lock(&state.session);
        let s = guard.as_ref().filter(|s| s.scan_id == scan_id).ok_or("Hasil scan tidak ditemukan atau sudah kedaluwarsa. Lakukan scan ulang.")?;
        require_clean_allowed(confirmed, s.reviewed)?;
        let mut items: Vec<(String, ScanItem)> = Vec::new();
        for cid in &category_ids {
            let ok = s.results.iter().any(|r| &r.category_id == cid && r.scan_status == ScanStatus::Completed);
            if !ok {
                continue;
            }
            if let Some(list) = s.items.get(cid) {
                items.extend(list.iter().filter(|i| i.eligible).cloned().map(|i| (cid.clone(), i)));
            }
        }
        let bytes: u64 = items.iter().map(|(_, i)| i.size).sum();
        (items, bytes)
    };
    if items.is_empty() {
        return Err("Tidak ada file yang memenuhi syarat untuk dibersihkan.".into());
    }
    let settings = store(&app)?.load_settings();
    try_busy(&state)?;
    let env = env_snapshot(&state);
    let op_id = format!("clean-{}", now_ms());
    let cancel = Arc::new(AtomicBool::new(false));
    *lock(&state.clean_cancel) = Some(cancel.clone());
    let (app2, op2) = (app.clone(), op_id.clone());
    std::thread::spawn(move || {
        let state = app2.state::<AppState>();
        let mut last = Instant::now() - Duration::from_secs(1);
        let app_p = app2.clone();
        let op_p = op2.clone();
        let mut on_progress = |p: cleaner::CleanProgress| {
            if last.elapsed() >= Duration::from_millis(120) || p.done == p.total {
                last = Instant::now();
                let _ = app_p.emit("clean_progress", CleanProgressEvent { operation_id: op_p.clone(), done: p.done, total: p.total, bytes_deleted: p.bytes_deleted });
            }
        };
        let opts = CleanOptions { min_age_secs: settings.min_age_minutes * 60 };
        let report: CleanReport = cleaner::clean(&op2, &items, &env, &opts, &cancel, &mut on_progress);
        if let Ok(st) = store(&app2) {
            let mut reasons: Vec<String> = report.errors.iter().map(|e| e.reason.clone()).collect();
            reasons.dedup();
            let _ = st.append_history(
                HistoryEntry {
                    id: op2.clone(),
                    kind: "clean".into(),
                    timestamp_ms: report.completed_at,
                    categories: report.by_category.iter().map(|c| c.category_id.clone()).collect(),
                    files_found: report.files_attempted,
                    bytes_found: bytes_attempted,
                    files_deleted: report.files_deleted,
                    bytes_deleted: report.bytes_deleted,
                    files_skipped: report.files_skipped,
                    files_failed: report.files_failed,
                    failure_reasons: reasons,
                },
                settings.history_retention_days,
            );
        }
        // Hasil scan sudah tidak valid setelah pembersihan; pengguna harus scan ulang.
        *lock(&state.session) = None;
        let _ = app2.emit("clean_done", report);
        state.busy.store(false, Ordering::SeqCst);
    });
    Ok(op_id)
}

#[tauri::command]
pub async fn cancel_clean(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(c) = lock(&state.clean_cancel).as_ref() {
        c.store(true, Ordering::SeqCst);
    }
    Ok(())
}

// ---------- Storage Analyzer ----------

#[derive(Serialize)]
pub struct KnownFolder {
    label: String,
    path: String,
}

#[tauri::command]
pub async fn known_folders() -> Result<Vec<KnownFolder>, String> {
    let env = Env::from_system();
    let mut v = Vec::new();
    let mut add = |label: &str, p: Option<std::path::PathBuf>| {
        if let Some(p) = p.filter(|p| p.is_dir()) {
            v.push(KnownFolder { label: label.into(), path: p.to_string_lossy().to_string() });
        }
    };
    add("Folder pengguna", env.user_profile.clone());
    add("Unduhan", env.user_profile.as_ref().map(|u| u.join("Downloads")));
    add("Dokumen", env.user_profile.as_ref().map(|u| u.join("Documents")));
    add("Gambar", env.user_profile.as_ref().map(|u| u.join("Pictures")));
    add("Video", env.user_profile.as_ref().map(|u| u.join("Videos")));
    add("AppData (Local)", env.local_app_data.clone());
    add("Temp pengguna", env.temp.clone());
    Ok(v)
}

#[tauri::command]
pub async fn analyze_directory(state: State<'_, AppState>, path: String, max_depth: u32) -> Result<DirAnalysis, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    *lock(&state.analyze_cancel) = Some(cancel.clone());
    let opts = AnalyzeOptions { max_depth: max_depth.clamp(1, 12) as usize, ..AnalyzeOptions::default() };
    tauri::async_runtime::spawn_blocking(move || analyze_dir(Path::new(&path), &opts, &cancel))
        .await
        .map_err(|e| e.to_string())?
}

// ---------- Riwayat & pengaturan ----------

#[tauri::command]
pub async fn history_list(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let mut h = store(&app)?.load_history();
    h.reverse();
    Ok(h)
}

#[tauri::command]
pub async fn history_clear(app: AppHandle) -> Result<(), String> {
    store(&app)?.clear_history()
}

#[tauri::command]
pub async fn settings_get(app: AppHandle) -> Result<Settings, String> {
    Ok(store(&app)?.load_settings())
}

#[tauri::command]
pub async fn settings_set(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    store(&app)?.save_settings(settings)
}

#[tauri::command]
pub async fn cancel_analysis(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(c) = lock(&state.analyze_cancel).as_ref() {
        c.store(true, Ordering::SeqCst);
    }
    Ok(())
}
