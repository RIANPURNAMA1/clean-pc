use cleanpc_core::session::ScanSession;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use sysinfo::System;

pub struct AppState {
    pub session: Mutex<Option<ScanSession>>,
    pub scan_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub clean_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub analyze_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub busy: AtomicBool,
    pub sys: Mutex<System>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            session: Mutex::new(None),
            scan_cancel: Mutex::new(None),
            clean_cancel: Mutex::new(None),
            analyze_cancel: Mutex::new(None),
            busy: AtomicBool::new(false),
            sys: Mutex::new(System::new()),
        }
    }
}
