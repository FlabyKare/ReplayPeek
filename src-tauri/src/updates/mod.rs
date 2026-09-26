#[cfg(not(debug_assertions))]
use std::{thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

const UPDATE_EVENT: &str = "update://status";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    state: &'static str,
    message: String,
    version: Option<String>,
    progress: Option<u8>,
}

fn emit_status(
    app: &AppHandle,
    state: &'static str,
    message: impl Into<String>,
    version: Option<String>,
    progress: Option<u8>,
) {
    let status = UpdateStatus {
        state,
        message: message.into(),
        version,
        progress,
    };
    log::info!("updater status: {} - {}", status.state, status.message);
    if let Err(error) = app.emit_to("main", UPDATE_EVENT, status) {
        log::warn!("failed to emit updater status: {error}");
    }
}

async fn run_check(app: AppHandle) -> AppResult<()> {
    emit_status(&app, "checking", "Проверяем обновления…", None, None);

    let updater = app
        .updater()
        .map_err(|error| AppError::new("updater_error", error.to_string()))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|error| AppError::new("updater_error", error.to_string()))?
    else {
        emit_status(
            &app,
            "upToDate",
            "Установлена актуальная версия",
            None,
            None,
        );
        return Ok(());
    };

    let version = update.version.clone();
    emit_status(
        &app,
        "available",
        format!("Доступна версия {version}"),
        Some(version.clone()),
        Some(0),
    );

    let progress_app = app.clone();
    let progress_version = version.clone();
    let mut downloaded = 0_u64;
    let mut last_progress = 0_u8;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let progress = content_length
                    .filter(|total| *total > 0)
                    .map(|total| ((downloaded.saturating_mul(100) / total).min(100)) as u8);
                if let Some(progress) = progress {
                    if progress >= last_progress.saturating_add(5) || progress == 100 {
                        last_progress = progress;
                        emit_status(
                            &progress_app,
                            "downloading",
                            format!("Скачиваем обновление: {progress}%"),
                            Some(progress_version.clone()),
                            Some(progress),
                        );
                    }
                }
            },
            {
                let app = app.clone();
                let version = version.clone();
                move || {
                    emit_status(
                        &app,
                        "installing",
                        "Устанавливаем обновление и перезапускаем приложение…",
                        Some(version),
                        Some(100),
                    );
                }
            },
        )
        .await
        .map_err(|error| AppError::new("updater_error", error.to_string()))?;

    Ok(())
}

fn spawn_check(app: AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    if !state.begin_update_check() {
        return Err(AppError::new(
            "update_in_progress",
            "Проверка обновлений уже выполняется",
        ));
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_check(app.clone()).await {
            log::error!("update check failed: {error}");
            emit_status(&app, "error", error.message, None, None);
        }
        app.state::<AppState>().finish_update_check();
    });

    Ok(())
}

pub fn start_automatic_check(app: AppHandle) {
    #[cfg(not(debug_assertions))]
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(5));
        if let Err(error) = spawn_check(app) {
            log::warn!("automatic update check was not started: {error}");
        }
    });

    #[cfg(debug_assertions)]
    let _ = app;
}

#[tauri::command]
pub fn check_for_updates(app: AppHandle) -> AppResult<()> {
    spawn_check(app)
}
