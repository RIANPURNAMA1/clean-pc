use cleanpc_core::analyzer::{analyze_dir, AnalyzeOptions};
use cleanpc_core::cleaner::{clean, CleanOptions};
use cleanpc_core::guard;
use cleanpc_core::scanner::{scan_category, ScanOptions};
use cleanpc_core::session::require_clean_allowed;
use cleanpc_core::store::{HistoryEntry, Settings, Store};
use cleanpc_core::{Env, ScanItem, ScanStatus};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};
use tempfile::TempDir;

struct Fx {
    _tmp: TempDir,
    env: Env,
    temp: PathBuf,
    docs: PathBuf,
    lad: PathBuf,
}

fn fixture() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(tmp.path()).unwrap();
    let windir = root.join("Windows");
    let user = root.join("Users").join("me");
    let lad = user.join("AppData").join("Local");
    let temp = lad.join("Temp");
    let docs = user.join("Documents");
    for d in [&windir.join("Temp"), &windir.join("System32"), &temp, &docs] {
        fs::create_dir_all(d).unwrap();
    }
    let env = Env {
        windir: Some(windir),
        temp: Some(temp.clone()),
        local_app_data: Some(lad.clone()),
        user_profile: Some(user),
        running: Default::default(),
    };
    Fx { _tmp: tmp, env, temp, docs, lad }
}

fn write(p: &Path, bytes: usize, age_secs: u64) {
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, vec![b'x'; bytes]).unwrap();
    let f = File::options().write(true).open(p).unwrap();
    f.set_modified(SystemTime::now() - Duration::from_secs(age_secs)).unwrap();
}

const OLD: u64 = 7200;
fn opts() -> ScanOptions {
    ScanOptions { min_age_secs: 3600, max_files: 200_000, max_depth: 12 }
}
fn copts() -> CleanOptions {
    CleanOptions { min_age_secs: 3600 }
}
fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
}
fn scan(fx: &Fx, id: &str) -> cleanpc_core::scanner::CategoryOutcome {
    scan_category(id, &fx.env, &opts(), &no_cancel(), &mut |_| {})
}
fn pairs(cat: &str, items: &[ScanItem]) -> Vec<(String, ScanItem)> {
    items.iter().cloned().map(|i| (cat.to_string(), i)).collect()
}
fn run_clean(fx: &Fx, items: &[(String, ScanItem)]) -> cleanpc_core::CleanReport {
    clean("op", items, &fx.env, &copts(), &no_cancel(), &mut |_| {})
}
fn forged(path: PathBuf) -> ScanItem {
    let m = fs::metadata(&path).unwrap();
    ScanItem {
        path,
        size: m.len(),
        modified_ms: cleanpc_core::scanner::modified_ms_of(&m),
        eligible: true,
        reason: None,
    }
}

#[test]
fn scan_selects_only_eligible_in_allowed_dir_and_sums_sizes() {
    let fx = fixture();
    write(&fx.temp.join("a.tmp"), 100, OLD);
    write(&fx.temp.join("sub/b.log"), 250, OLD);
    write(&fx.temp.join("fresh.tmp"), 40, 5);
    write(&fx.temp.join("report.docx"), 70, OLD);
    let r = scan(&fx, "user_temp");
    assert_eq!(r.status, ScanStatus::Completed);
    assert_eq!(r.files_found, 4);
    assert_eq!(r.eligible_files, 2);
    assert_eq!(r.eligible_bytes, 350);
    assert_eq!(r.total_bytes, 460);
}

#[test]
fn empty_directory_gives_zero() {
    let fx = fixture();
    let r = scan(&fx, "user_temp");
    assert_eq!((r.status, r.files_found, r.total_bytes), (ScanStatus::Completed, 0, 0));
}

#[test]
fn missing_location_is_unavailable() {
    let fx = fixture();
    let r = scan(&fx, "thumbnail_cache");
    assert_eq!(r.status, ScanStatus::Unavailable);
}

#[test]
fn protected_roots_are_rejected() {
    let mut fx = fixture();
    let user = fx.env.user_profile.clone().unwrap();
    assert!(guard::validate_root(&fx.docs, &fx.env).is_err());
    assert!(guard::validate_root(&user, &fx.env).is_err());
    assert!(guard::validate_root(&fx.env.windir.clone().unwrap().join("System32"), &fx.env).is_err());
    assert!(guard::validate_root(&fx.env.windir.clone().unwrap(), &fx.env).is_err());
    assert!(guard::validate_root(&fx.temp.join("..").join("Temp"), &fx.env).is_err());
    assert!(guard::validate_root(&fx.temp, &fx.env).is_ok());
    // TEMP yang dialihkan ke Documents tidak boleh dipindai/dibersihkan.
    write(&fx.docs.join("tesis.txt"), 10, OLD);
    fx.env.temp = Some(fx.docs.clone());
    let r = scan(&fx, "user_temp");
    assert_eq!(r.files_found, 0);
    assert!(fx.docs.join("tesis.txt").exists());
}

#[test]
fn path_traversal_item_is_not_deleted() {
    let fx = fixture();
    write(&fx.temp.join("ok.tmp"), 10, OLD);
    let secret = fx.docs.join("secret.txt");
    write(&secret, 10, OLD);
    let sneaky = fx.temp.join("..").join("..").join("Documents").join("secret.txt");
    let items = vec![("user_temp".to_string(), forged_via(&sneaky, &secret))];
    let rep = run_clean(&fx, &items);
    assert_eq!(rep.files_deleted, 0);
    assert_eq!(rep.files_skipped, 1);
    assert!(secret.exists());
}

fn forged_via(path: &Path, real: &Path) -> ScanItem {
    let mut i = forged(real.to_path_buf());
    i.path = path.to_path_buf();
    i
}

#[cfg(unix)]
#[test]
fn symlinks_are_skipped_and_targets_untouched() {
    use std::os::unix::fs::symlink;
    let fx = fixture();
    let outside = fx.docs.join("important.txt");
    write(&outside, 33, OLD);
    symlink(&outside, fx.temp.join("link_to_file")).unwrap();
    symlink(&fx.docs, fx.temp.join("link_to_dir")).unwrap();
    write(&fx.temp.join("real.tmp"), 5, OLD);
    let r = scan(&fx, "user_temp");
    assert_eq!(r.files_found, 1);
    assert!(r.warnings.iter().any(|w| w.contains("tautan")));
    // Item palsu yang menunjuk symlink juga harus ditolak.
    let items = vec![("user_temp".to_string(), forged(fx.temp.join("link_to_file")))];
    let rep = run_clean(&fx, &items);
    assert_eq!(rep.files_deleted, 0);
    assert!(outside.exists());
    // Item palsu lewat symlink direktori (induknya reparse) ditolak oleh pemeriksaan kanonik.
    let via_dir = fx.temp.join("link_to_dir").join("important.txt");
    let items = vec![("user_temp".to_string(), forged(via_dir))];
    let rep = run_clean(&fx, &items);
    assert_eq!(rep.files_deleted, 0);
    assert!(outside.exists());
}

#[test]
fn file_changed_after_scan_is_skipped() {
    let fx = fixture();
    let p = fx.temp.join("x.tmp");
    write(&p, 100, OLD);
    let r = scan(&fx, "user_temp");
    fs::write(&p, vec![b'y'; 500]).unwrap();
    let rep = run_clean(&fx, &pairs("user_temp", &r.items));
    assert_eq!(rep.files_deleted, 0);
    assert!(rep.errors.iter().any(|e| e.reason.contains("berubah")));
    assert!(p.exists());
}

#[test]
fn clean_deletes_only_eligible_and_counts_actual_bytes() {
    let fx = fixture();
    write(&fx.temp.join("a.tmp"), 100, OLD);
    write(&fx.temp.join("d/b.tmp"), 200, OLD);
    write(&fx.temp.join("fresh.tmp"), 7, 3);
    write(&fx.temp.join("keep.pdf"), 9, OLD);
    let r = scan(&fx, "user_temp");
    let eligible: Vec<_> = r.items.iter().filter(|i| i.eligible).cloned().collect();
    let rep = run_clean(&fx, &pairs("user_temp", &eligible));
    assert_eq!((rep.files_attempted, rep.files_deleted, rep.bytes_deleted), (2, 2, 300));
    assert!(!fx.temp.join("a.tmp").exists());
    assert!(fx.temp.join("fresh.tmp").exists());
    assert!(fx.temp.join("keep.pdf").exists());
    // Item tidak eligible yang dipaksa masuk tetap tidak dihapus.
    let rep2 = run_clean(&fx, &pairs("user_temp", &r.items));
    assert_eq!(rep2.files_deleted, 0);
    assert!(fx.temp.join("keep.pdf").exists());
}

#[test]
fn partial_failure_reports_each_outcome() {
    let fx = fixture();
    for n in ["1", "2", "3", "4"] {
        write(&fx.temp.join(format!("{n}.tmp")), 10, OLD);
    }
    let r = scan(&fx, "user_temp");
    fs::remove_file(fx.temp.join("1.tmp")).unwrap(); // hilang setelah scan
    fs::remove_file(fx.temp.join("2.tmp")).unwrap(); // diganti direktori
    fs::create_dir(fx.temp.join("2.tmp")).unwrap();
    let rep = run_clean(&fx, &pairs("user_temp", &r.items));
    assert_eq!(rep.files_attempted, 4);
    assert_eq!(rep.files_deleted, 2);
    assert_eq!(rep.files_skipped + rep.files_failed, 2);
    assert_eq!(rep.bytes_deleted, 20);
}

#[test]
fn personal_and_critical_files_are_never_deleted_even_if_forged() {
    let fx = fixture();
    let doc = fx.temp.join("skripsi.docx");
    write(&doc, 10, OLD);
    let crit = fx.env.windir.clone().unwrap().join("System32").join("kernel.dll");
    write(&crit, 10, OLD);
    let in_docs = fx.docs.join("foto.txt");
    write(&in_docs, 10, OLD);
    let items = vec![
        ("user_temp".to_string(), forged(doc.clone())),
        ("user_temp".to_string(), forged(crit.clone())),
        ("windows_temp".to_string(), forged(crit.clone())),
        ("user_temp".to_string(), forged(in_docs.clone())),
    ];
    let rep = run_clean(&fx, &items);
    assert_eq!(rep.files_deleted, 0);
    assert!(doc.exists() && crit.exists() && in_docs.exists());
}

#[test]
fn running_browser_blocks_cache_cleaning() {
    let mut fx = fixture();
    let f = fx.lad.join("Google/Chrome/User Data/Default/Cache/data_0");
    write(&f, 64, OLD);
    write(&fx.lad.join("Google/Chrome/User Data/Default/Cookies"), 8, OLD);
    let r = scan(&fx, "browser_cache");
    assert_eq!((r.files_found, r.eligible_files), (1, 1)); // Cookies tidak pernah masuk
    fx.env.running.insert("chrome.exe".into());
    let r2 = scan(&fx, "browser_cache");
    assert_eq!(r2.eligible_files, 0);
    let rep = run_clean(&fx, &pairs("browser_cache", &r.items)); // scan lama, browser kini berjalan
    assert_eq!(rep.files_deleted, 0);
    fx.env.running.clear();
    let rep = run_clean(&fx, &pairs("browser_cache", &r.items));
    assert_eq!(rep.files_deleted, 1);
    assert!(fx.lad.join("Google/Chrome/User Data/Default/Cookies").exists());
}

#[test]
fn thumbnail_pattern_only() {
    let fx = fixture();
    let dir = fx.lad.join("Microsoft/Windows/Explorer");
    write(&dir.join("thumbcache_256.db"), 50, OLD);
    write(&dir.join("iconcache_32.db"), 20, OLD);
    write(&dir.join("other.db"), 99, OLD);
    let r = scan(&fx, "thumbnail_cache");
    assert_eq!((r.files_found, r.eligible_bytes), (2, 70));
}

#[test]
fn scan_cancellation() {
    let fx = fixture();
    for i in 0..50 {
        write(&fx.temp.join(format!("f{i}.tmp")), 1, OLD);
    }
    let c = AtomicBool::new(true);
    let r = scan_category("user_temp", &fx.env, &opts(), &c, &mut |_| {});
    assert_eq!(r.status, ScanStatus::Cancelled);
    let r = scan(&fx, "user_temp");
    c.store(true, Ordering::Relaxed);
    let rep = clean("op", &pairs("user_temp", &r.items), &fx.env, &copts(), &c, &mut |_| {});
    assert!(rep.cancelled);
    assert_eq!(rep.files_deleted, 0);
    assert!(fx.temp.join("f0.tmp").exists());
}

#[test]
fn large_directory_and_limits() {
    let fx = fixture();
    for d in 0..30 {
        for i in 0..100 {
            write(&fx.temp.join(format!("d{d}/f{i}.tmp")), 2, OLD);
        }
    }
    let r = scan(&fx, "user_temp");
    assert_eq!((r.files_found, r.total_bytes), (3000, 6000));
    let small = ScanOptions { max_files: 500, ..opts() };
    let r = scan_category("user_temp", &fx.env, &small, &no_cancel(), &mut |_| {});
    assert_eq!(r.files_found, 500);
    assert!(r.warnings.iter().any(|w| w.contains("Batas")));
    let shallow = ScanOptions { max_depth: 0, ..opts() };
    write(&fx.temp.join("top.tmp"), 1, OLD);
    let r = scan_category("user_temp", &fx.env, &shallow, &no_cancel(), &mut |_| {});
    assert_eq!(r.files_found, 1);
    assert!(r.warnings.iter().any(|w| w.contains("Kedalaman")));
}

#[test]
fn confirmation_and_review_are_required() {
    assert!(require_clean_allowed(true, true).is_ok());
    assert!(require_clean_allowed(false, true).is_err());
    assert!(require_clean_allowed(true, false).is_err());
}

#[test]
fn analyzer_measures_sizes() {
    let fx = fixture();
    write(&fx.docs.join("a/x.bin"), 1000, 0);
    write(&fx.docs.join("a/b/y.bin"), 500, 0);
    write(&fx.docs.join("z.bin"), 10, 0);
    let a = analyze_dir(&fx.docs, &AnalyzeOptions::default(), &no_cancel()).unwrap();
    assert_eq!((a.total_bytes, a.total_files), (1510, 3));
    assert_eq!(a.entries[0].name, "a");
    assert!(analyze_dir(&fx.docs.join("nope"), &AnalyzeOptions::default(), &no_cancel()).is_err());
}

#[test]
fn store_settings_and_history_privacy() {
    let tmp = tempfile::tempdir().unwrap();
    let st = Store::new(tmp.path().to_path_buf());
    assert_eq!(st.load_settings(), Settings::default());
    let mut s = Settings::default();
    s.history_retention_days = 0;
    s.min_age_minutes = 5;
    s.enabled_categories.push("../etc".into());
    let saved = st.save_settings(s).unwrap();
    assert_eq!(saved.history_retention_days, 1);
    assert!(!saved.enabled_categories.iter().any(|c| c.contains("..")));
    let old = HistoryEntry { id: "1".into(), kind: "scan".into(), timestamp_ms: 1, categories: vec![], files_found: 0, bytes_found: 0, files_deleted: 0, bytes_deleted: 0, files_skipped: 0, files_failed: 0, failure_reasons: vec![] };
    let mut new = old.clone();
    new.timestamp_ms = cleanpc_core::model::now_ms();
    new.id = "2".into();
    st.append_history(old, 30).unwrap();
    st.append_history(new, 30).unwrap();
    let h = st.load_history();
    assert_eq!(h.len(), 1);
    assert_eq!(h[0].id, "2");
    st.clear_history().unwrap();
    assert!(st.load_history().is_empty());
}
