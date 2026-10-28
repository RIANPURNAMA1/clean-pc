use crate::model::{ScanItem, ScanResult};
use std::collections::HashMap;

/// Hasil scan terakhir yang disimpan di memori backend (bukan di frontend).
pub struct ScanSession {
    pub scan_id: String,
    pub results: Vec<ScanResult>,
    pub items: HashMap<String, Vec<ScanItem>>,
    pub reviewed: bool,
}

/// Pembersihan hanya boleh berjalan jika hasil sudah ditinjau dan pengguna mengonfirmasi.
pub fn require_clean_allowed(confirmed: bool, reviewed: bool) -> Result<(), String> {
    if !reviewed {
        return Err("Tinjau hasil scan terlebih dahulu sebelum membersihkan.".into());
    }
    if !confirmed {
        return Err("Pembersihan memerlukan konfirmasi eksplisit dari pengguna.".into());
    }
    Ok(())
}
