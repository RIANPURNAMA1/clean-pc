mod commands;
mod state;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_system_info,
            commands::get_live_stats,
            commands::list_categories,
            commands::start_scan,
            commands::cancel_scan,
            commands::get_scan_items,
            commands::mark_reviewed,
            commands::session_status,
            commands::start_clean,
            commands::cancel_clean,
            commands::cancel_analysis,
            commands::known_folders,
            commands::analyze_directory,
            commands::history_list,
            commands::history_clear,
            commands::settings_get,
            commands::settings_set,
        ])
        .run(tauri::generate_context!())
        .expect("Gagal menjalankan CleanPC");
}
