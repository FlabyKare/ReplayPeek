use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::{overlay, state::AppState};

pub fn install(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let capture_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);
    let watched_shortcut = capture_shortcut;

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut == &watched_shortcut && event.state() == ShortcutState::Pressed {
                    log::info!("global capture hotkey pressed");
                    let state = app.state::<AppState>();
                    if let Err(error) = overlay::show_selection_overlays(app, &state) {
                        log::error!("failed to show selection overlay: {error}");
                    }
                }
            })
            .build(),
    )?;

    match app.global_shortcut().register(capture_shortcut) {
        Ok(()) => {
            app.state::<AppState>().runtime.lock().hotkey_registered = true;
            log::info!("registered global hotkey Ctrl+Shift+S");
        }
        Err(error) => {
            let warning = crate::error::AppError::new(
                "hotkey_registration_failed",
                format!("Ctrl+Shift+S уже используется другим приложением: {error}"),
            );
            log::error!("{warning}");
            app.state::<AppState>().runtime.lock().startup_warning = Some(warning);
        }
    }
    Ok(())
}
