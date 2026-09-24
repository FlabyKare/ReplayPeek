use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{
    error::{AppError, AppResult},
    models::AppSettings,
    overlay,
    state::AppState,
};

pub fn install(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }

                let state = app.state::<AppState>();
                let configured = state.settings.get().hotkeys.capture_region;
                let Ok(configured) = configured.parse::<Shortcut>() else {
                    log::error!("stored capture hotkey is invalid");
                    return;
                };
                if shortcut != &configured {
                    return;
                }

                log::info!("global capture hotkey pressed");
                if let Err(error) = overlay::show_selection_overlays(app, &state) {
                    log::error!("failed to show selection overlay: {error}");
                }
            })
            .build(),
    )?;

    let capture_hotkey = app
        .state::<AppState>()
        .settings
        .get()
        .hotkeys
        .capture_region;
    match app.global_shortcut().register(capture_hotkey.as_str()) {
        Ok(()) => {
            app.state::<AppState>().runtime.lock().hotkey_registered = true;
            log::info!("registered global hotkey {capture_hotkey}");
        }
        Err(error) => {
            let warning = crate::error::AppError::new(
                "hotkey_registration_failed",
                format!("{capture_hotkey} уже используется другим приложением: {error}"),
            );
            log::error!("{warning}");
            app.state::<AppState>().runtime.lock().startup_warning = Some(warning);
        }
    }
    Ok(())
}

pub fn update_capture_hotkey(
    app: &AppHandle,
    state: &AppState,
    hotkey: String,
) -> AppResult<AppSettings> {
    let hotkey = hotkey.trim().to_string();
    if hotkey.is_empty() || hotkey.len() > 64 {
        return Err(AppError::new(
            "hotkey_invalid",
            "Введите корректную комбинацию клавиш",
        ));
    }

    let previous = state.settings.get().hotkeys.capture_region;
    let previous_registered = app.global_shortcut().is_registered(previous.as_str());
    let same_hotkey = previous.eq_ignore_ascii_case(&hotkey);
    let registered_now = !same_hotkey || !previous_registered;

    if registered_now {
        app.global_shortcut()
            .register(hotkey.as_str())
            .map_err(|error| {
                AppError::new(
                    "hotkey_registration_failed",
                    format!("Не удалось зарегистрировать {hotkey}: {error}"),
                )
            })?;
    }

    if !same_hotkey && previous_registered {
        if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
            let _ = app.global_shortcut().unregister(hotkey.as_str());
            return Err(AppError::new(
                "hotkey_unregister_failed",
                format!("Не удалось отключить прежнюю комбинацию {previous}: {error}"),
            ));
        }
    }

    let settings = match state.settings.set_capture_hotkey(hotkey.clone()) {
        Ok(settings) => settings,
        Err(error) => {
            if registered_now {
                let _ = app.global_shortcut().unregister(hotkey.as_str());
            }
            if !same_hotkey && previous_registered {
                let _ = app.global_shortcut().register(previous.as_str());
            }
            return Err(error);
        }
    };

    let mut runtime = state.runtime.lock();
    runtime.hotkey_registered = true;
    runtime.startup_warning = None;
    log::info!("capture hotkey changed from {previous} to {hotkey}");
    Ok(settings)
}
