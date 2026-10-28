//! Aturan eksplisit per kategori: lokasi, pola nama file, pengecualian.
use crate::env::Env;
use std::fs;
use std::path::{Path, PathBuf};

pub struct CategoryDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

pub const DEFS: &[CategoryDef] = &[
    CategoryDef { id: "windows_temp", name: "File sementara Windows", description: "Isi folder Temp milik Windows (C:\\Windows\\Temp). Sebagian file mungkin butuh hak administrator dan akan dilewati." },
    CategoryDef { id: "user_temp", name: "File sementara pengguna", description: "Isi folder Temp milik akun Anda. File dokumen, kunci, dan file yang baru diubah dikecualikan." },
    CategoryDef { id: "thumbnail_cache", name: "Cache thumbnail", description: "Cache gambar mini dan ikon File Explorer (thumbcache/iconcache). Dibuat ulang otomatis oleh Windows." },
    CategoryDef { id: "browser_cache", name: "Cache browser", description: "Cache Chrome, Edge, Brave, dan Firefox. Cookie, sandi, riwayat, dan sesi tidak disentuh. Browser harus ditutup." },
    CategoryDef { id: "app_cache", name: "Cache aplikasi tertentu", description: "INetCache dan cache shader DirectX (D3DSCache). Dibuat ulang otomatis saat dibutuhkan." },
    CategoryDef { id: "app_logs", name: "Log dan laporan crash", description: "Crash dump pengguna dan arsip laporan Windows Error Reporting milik akun Anda." },
];

pub fn def(id: &str) -> Option<&'static CategoryDef> {
    DEFS.iter().find(|d| d.id == id)
}

#[derive(Clone, Copy)]
pub enum NameFilter {
    Any,
    ThumbCache,
    Extensions(&'static [&'static str]),
}

fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

impl NameFilter {
    pub fn matches(&self, name: &str) -> bool {
        let lower = name.to_lowercase();
        match self {
            NameFilter::Any => true,
            NameFilter::ThumbCache => {
                (lower.starts_with("thumbcache_") || lower.starts_with("iconcache_")) && lower.ends_with(".db")
            }
            NameFilter::Extensions(list) => list.contains(&ext_of(name).as_str()),
        }
    }
}

/// Jenis file yang dianggap pribadi/penting dan TIDAK dihapus dari folder Temp.
pub const PERSONAL_EXT: &[&str] = &[
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "odt", "ods", "psd", "kdbx", "pem", "pfx", "p12",
    "key", "sqlite", "sqlite3", "db", "jpg", "jpeg", "png", "mp4", "mkv", "zip", "7z", "rar",
];

pub fn is_personal(name: &str) -> bool {
    PERSONAL_EXT.contains(&ext_of(name).as_str())
}

#[derive(Clone)]
pub struct Target {
    pub root: PathBuf,
    pub recursive: bool,
    pub filter: NameFilter,
    /// Proses yang harus tidak berjalan (browser).
    pub process: Option<&'static str>,
    pub exclude_personal: bool,
}

fn t(root: PathBuf, recursive: bool, filter: NameFilter) -> Target {
    Target { root, recursive, filter, process: None, exclude_personal: false }
}

fn browser_targets(user_data: PathBuf, process: &'static str, out: &mut Vec<Target>) {
    if let Ok(rd) = fs::read_dir(&user_data) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name == "Default" || name.starts_with("Profile ") {
                for sub in ["Cache", "Code Cache", "GPUCache"] {
                    let mut tg = t(e.path().join(sub), true, NameFilter::Any);
                    tg.process = Some(process);
                    out.push(tg);
                }
            }
        }
    }
}

/// Lokasi untuk sebuah kategori pada lingkungan tertentu (hanya yang ada di perangkat).
pub fn targets(id: &str, env: &Env) -> Vec<Target> {
    let mut v = Vec::new();
    let lad = env.local_app_data.clone();
    match id {
        "windows_temp" => {
            if let Some(w) = &env.windir {
                let mut tg = t(w.join("Temp"), true, NameFilter::Any);
                tg.exclude_personal = true;
                v.push(tg);
            }
        }
        "user_temp" => {
            if let Some(p) = &env.temp {
                let mut tg = t(p.clone(), true, NameFilter::Any);
                tg.exclude_personal = true;
                v.push(tg);
            }
        }
        "thumbnail_cache" => {
            if let Some(l) = &lad {
                v.push(t(l.join("Microsoft").join("Windows").join("Explorer"), false, NameFilter::ThumbCache));
            }
        }
        "browser_cache" => {
            if let Some(l) = &lad {
                browser_targets(l.join("Google").join("Chrome").join("User Data"), "chrome.exe", &mut v);
                browser_targets(l.join("Microsoft").join("Edge").join("User Data"), "msedge.exe", &mut v);
                browser_targets(l.join("BraveSoftware").join("Brave-Browser").join("User Data"), "brave.exe", &mut v);
                if let Ok(rd) = fs::read_dir(l.join("Mozilla").join("Firefox").join("Profiles")) {
                    for e in rd.flatten() {
                        let mut tg = t(e.path().join("cache2"), true, NameFilter::Any);
                        tg.process = Some("firefox.exe");
                        v.push(tg);
                    }
                }
            }
        }
        "app_cache" => {
            if let Some(l) = &lad {
                v.push(t(l.join("Microsoft").join("Windows").join("INetCache"), true, NameFilter::Any));
                v.push(t(l.join("D3DSCache"), true, NameFilter::Any));
            }
        }
        "app_logs" => {
            if let Some(l) = &lad {
                v.push(t(l.join("CrashDumps"), false, NameFilter::Extensions(&["dmp", "mdmp", "log"])));
                let wer = l.join("Microsoft").join("Windows").join("WER");
                for sub in ["ReportArchive", "ReportQueue"] {
                    v.push(t(wer.join(sub), true, NameFilter::Extensions(&["wer", "dmp", "mdmp", "log", "hdmp"])));
                }
            }
        }
        _ => {}
    }
    v.into_iter().filter(|x| x.root.is_dir()).collect()
}
