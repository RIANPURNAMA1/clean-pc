//! Kebijakan keamanan path: lokasi terlarang, validasi root, deteksi reparse point.
use crate::env::Env;
use std::fs;
use std::path::{Component, Path, PathBuf};

fn comps(p: &Path) -> Vec<String> {
    p.components()
        .filter(|c| !matches!(c, Component::CurDir))
        .map(|c| {
            let s = c.as_os_str().to_string_lossy().to_string();
            if cfg!(windows) { s.to_lowercase() } else { s }
        })
        .collect()
}

/// Apakah `p` berada di dalam (atau sama dengan) `base`. Perbandingan per-komponen,
/// bukan per-string, sehingga "C:\Temp2" bukan bagian dari "C:\Temp".
pub fn is_within(p: &Path, base: &Path) -> bool {
    let (a, b) = (comps(p), comps(base));
    a.len() >= b.len() && a[..b.len()] == b[..]
}

fn has_parent_dir(p: &Path) -> bool {
    p.components().any(|c| matches!(c, Component::ParentDir))
}

/// Subtree yang tidak boleh disentuh, dan root pembersihan tidak boleh menjadi induknya.
fn protected_subtrees(env: &Env) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(w) = &env.windir {
        for d in ["System32", "SysWOW64", "WinSxS", "Installer", "servicing", "assembly", "Fonts", "Boot"] {
            v.push(w.join(d));
        }
    }
    if let Some(u) = &env.user_profile {
        for d in ["Documents", "Desktop", "Downloads", "Pictures", "Videos", "Music", "OneDrive"] {
            v.push(u.join(d));
        }
        v.push(u.join("AppData").join("Roaming"));
    }
    v
}

/// Lokasi yang tidak boleh menjadi root pembersihan (sama atau induknya).
fn protected_exact(env: &Env) -> Vec<PathBuf> {
    [&env.windir, &env.user_profile, &env.local_app_data]
        .iter()
        .filter_map(|o| (*o).clone())
        .collect()
}

fn canon_or_self(p: &Path) -> PathBuf {
    fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

/// Validasi root kategori. Mengembalikan path kanonik jika aman.
pub fn validate_root(root: &Path, env: &Env) -> Result<PathBuf, String> {
    if has_parent_dir(root) {
        return Err("Path mengandung '..'".into());
    }
    let canon = fs::canonicalize(root).map_err(|_| "Lokasi tidak ditemukan".to_string())?;
    if canon.parent().is_none() {
        return Err("Root drive tidak boleh dibersihkan".into());
    }
    for p in protected_subtrees(env) {
        let p = canon_or_self(&p);
        if is_within(&canon, &p) || is_within(&p, &canon) {
            return Err("Lokasi dilindungi oleh kebijakan keamanan".into());
        }
    }
    for p in protected_exact(env) {
        let p = canon_or_self(&p);
        if is_within(&p, &canon) {
            return Err("Lokasi terlalu luas dan dilindungi".into());
        }
    }
    Ok(canon)
}

/// Reparse point (symlink, junction, placeholder cloud) atau symlink di Unix.
pub fn is_reparse(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    meta.file_type().is_symlink()
}
