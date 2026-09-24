use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

const SELECTION_PREFIX: &str = "selection-";

pub fn prepare_selection_overlays(app: &tauri::AppHandle) -> AppResult<()> {
    let monitors = app.available_monitors().map_err(AppError::window)?;
    if monitors.is_empty() {
        return Err(AppError::new(
            "monitor_missing",
            "Windows не вернула доступные мониторы",
        ));
    }

    for (index, monitor) in monitors.iter().enumerate() {
        let label = format!("{SELECTION_PREFIX}{index}");
        let window = if let Some(existing) = app.get_webview_window(&label) {
            existing
        } else {
            WebviewWindowBuilder::new(
                app,
                &label,
                WebviewUrl::App("index.html?view=selection".into()),
            )
            .title("Select capture region")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(AppError::window)?
        };

        window
            .set_position(PhysicalPosition::new(
                monitor.position().x,
                monitor.position().y,
            ))
            .map_err(AppError::window)?;
        window
            .set_size(PhysicalSize::new(
                monitor.size().width,
                monitor.size().height,
            ))
            .map_err(AppError::window)?;
        window
            .set_ignore_cursor_events(false)
            .map_err(AppError::window)?;
    }

    log::info!(
        "prepared selection overlays for {} monitor(s)",
        monitors.len()
    );
    Ok(())
}

pub fn show_selection_overlays(app: &tauri::AppHandle, state: &AppState) -> AppResult<()> {
    prepare_selection_overlays(app)?;

    let main = app.get_webview_window("main");
    let main_was_visible = main
        .as_ref()
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false);
    state.session.lock().main_was_visible = main_was_visible;
    if let Some(main) = main {
        main.hide().map_err(AppError::window)?;
    }

    let monitors = app.available_monitors().map_err(AppError::window)?;
    for index in 0..monitors.len() {
        let label = format!("{SELECTION_PREFIX}{index}");
        let window = app.get_webview_window(&label).ok_or_else(|| {
            AppError::new(
                "selection_window_missing",
                format!("Не найдено окно {label}"),
            )
        })?;
        window.show().map_err(AppError::window)?;
    }

    if let Some(first) = app.get_webview_window(&format!("{SELECTION_PREFIX}0")) {
        first.set_focus().map_err(AppError::window)?;
    }
    log::info!("selection overlays shown on {} monitor(s)", monitors.len());
    Ok(())
}

pub fn hide_selection_overlays(app: &tauri::AppHandle) -> AppResult<()> {
    for (label, window) in app.webview_windows() {
        if label.starts_with(SELECTION_PREFIX) {
            window.hide().map_err(AppError::window)?;
        }
    }
    Ok(())
}

pub fn show_main_window(app: &tauri::AppHandle) -> AppResult<()> {
    if let Some(main) = app.get_webview_window("main") {
        main.unminimize().map_err(AppError::window)?;
        main.show().map_err(AppError::window)?;
        main.set_focus().map_err(AppError::window)?;
    }
    Ok(())
}
