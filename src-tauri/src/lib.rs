mod capture;
mod commands;
mod error;
mod hotkeys;
mod models;
mod overlay;
mod state;
mod tray;

use std::path::PathBuf;

use tauri::Manager;

use crate::{state::AppState, state::SettingsRepository};

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .setup(|app| {
            let settings_path: PathBuf = app.path().app_config_dir()?.join("settings.json");
            let settings = SettingsRepository::load(settings_path)?;
            app.manage(AppState::new(settings));
            overlay::prepare_selection_overlays(app.handle())?;
            hotkeys::install(app)?;
            tray::install(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::start_region_selection,
            commands::capture::cancel_region_selection,
            commands::capture::complete_region_selection,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::system::get_runtime_status,
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        log::error!("failed to hide main window: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Reply Overlay");
}
