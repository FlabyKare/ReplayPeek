use tauri::State;

use crate::{error::AppResult, models::AppSettings, state::AppState};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.settings.replace(settings)
}
