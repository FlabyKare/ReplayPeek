use serde::Serialize;
use tauri::State;

use crate::{error::AppError, state::AppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    hotkey_registered: bool,
    warning: Option<AppError>,
}

#[tauri::command]
pub fn get_runtime_status(state: State<'_, AppState>) -> RuntimeStatus {
    let runtime = state.runtime.lock();
    RuntimeStatus {
        hotkey_registered: runtime.hotkey_registered,
        warning: runtime.startup_warning.clone(),
    }
}
