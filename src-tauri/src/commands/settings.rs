use tauri::{AppHandle, State};

use crate::{error::AppResult, hotkeys, models::AppSettings, state::AppState};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<AppSettings> {
    let current_hotkey = state.settings.get().hotkeys.capture_region;
    if !current_hotkey.eq_ignore_ascii_case(&settings.hotkeys.capture_region) {
        hotkeys::update_capture_hotkey(&app, &state, settings.hotkeys.capture_region.clone())?;
    }
    state.settings.replace(settings)
}

#[tauri::command]
pub fn update_capture_hotkey(
    hotkey: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<AppSettings> {
    hotkeys::update_capture_hotkey(&app, &state, hotkey)
}
