use std::{io::Cursor, time::Instant};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use image::{ImageBuffer, ImageFormat, Rgba};
use tauri::{Emitter, Manager, State, WebviewWindow};

use crate::{
    error::{AppError, AppResult},
    models::{CapturePayload, CaptureRegion, SelectionRect},
    overlay,
    state::AppState,
};

#[tauri::command]
pub fn start_region_selection(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    log::info!("start region selection requested");
    if let Err(error) = overlay::show_selection_overlays(&app, &state) {
        log::error!("failed to start region selection: {error}");
        let _ = overlay::show_main_window(&app);
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.emit("error://reported", error.clone());
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_region_selection(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    overlay::hide_selection_overlays(&app)?;
    if state.session.lock().main_was_visible {
        overlay::show_main_window(&app)?;
    }
    log::info!("selection cancelled");
    Ok(())
}

#[tauri::command]
pub async fn complete_region_selection(
    window: WebviewWindow,
    selection: SelectionRect,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<CapturePayload> {
    let scale = window.scale_factor().map_err(AppError::window)?;
    let position = window.inner_position().map_err(AppError::window)?;
    let monitor_name = window
        .current_monitor()
        .map_err(AppError::window)?
        .and_then(|monitor| monitor.name().map(ToOwned::to_owned));

    let region = physical_region(selection, position.x, position.y, scale, monitor_name)?;
    state.settings.set_capture_region(region.clone())?;
    overlay::hide_selection_overlays(&app)?;

    let capture = state.capture.clone();
    let ocr_language = state.settings.get().language;
    let region_for_capture = region.clone();
    let started = Instant::now();
    let task = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        let frame = capture.capture_region(&region_for_capture)?;
        let image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
            frame.width,
            frame.height,
            frame.rgba.clone(),
        )
        .ok_or_else(|| AppError::new("image_invalid", "Некорректный RGBA-буфер снимка"))?;
        let mut png = Cursor::new(Vec::new());
        image
            .write_to(&mut png, ImageFormat::Png)
            .map_err(AppError::capture)?;
        Ok::<_, AppError>((frame, png.into_inner()))
    })
    .await
    .map_err(|error| AppError::new("capture_task_failed", error.to_string()))?;

    let (frame, png) = match task {
        Ok(result) => result,
        Err(error) => {
            overlay::show_main_window(&app)?;
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit("error://reported", error.clone());
            }
            return Err(error);
        }
    };

    overlay::show_main_window(&app)?;
    if let Some(main) = app.get_webview_window("main") {
        if let Err(error) = main.emit("capture://processing", ()) {
            log::warn!("failed to emit OCR processing event: {error}");
        }
    }

    let ocr = state.ocr.clone();
    let ocr_result =
        tauri::async_runtime::spawn_blocking(move || ocr.recognize(&frame, &ocr_language))
            .await
            .unwrap_or_else(|error| {
                Err(AppError::new(
                    "ocr_task_failed",
                    format!("Фоновая задача OCR завершилась с ошибкой: {error}"),
                ))
            });

    let (ocr_result, ocr_error) = match ocr_result {
        Ok(result) => {
            log::info!(
                "OCR completed in {}ms using {} ({} characters)",
                result.duration_ms,
                result.language,
                result.text.chars().count()
            );
            log::debug!("OCR result: {}", result.text);
            (Some(result), None)
        }
        Err(error) => {
            log::error!("OCR failed: {error}");
            (None, Some(error))
        }
    };

    let payload = CapturePayload {
        region,
        data_url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
        captured_at: Utc::now().to_rfc3339(),
        duration_ms: started.elapsed().as_millis(),
        ocr_result,
        ocr_error,
    };

    if let Some(main) = app.get_webview_window("main") {
        main.emit("capture://completed", payload.clone())
            .map_err(AppError::window)?;
    }
    log::info!(
        "capture completed: {}x{} at ({}, {}), {}ms",
        payload.region.width,
        payload.region.height,
        payload.region.x,
        payload.region.y,
        payload.duration_ms
    );
    Ok(payload)
}

fn physical_region(
    selection: SelectionRect,
    window_x: i32,
    window_y: i32,
    scale: f64,
    monitor_id: Option<String>,
) -> AppResult<CaptureRegion> {
    if !selection.x.is_finite()
        || !selection.y.is_finite()
        || !selection.width.is_finite()
        || !selection.height.is_finite()
        || selection.width < 4.0
        || selection.height < 4.0
    {
        return Err(AppError::new(
            "selection_invalid",
            "Область выделения слишком мала",
        ));
    }

    Ok(CaptureRegion {
        x: window_x.saturating_add((selection.x * scale).round() as i32),
        y: window_y.saturating_add((selection.y * scale).round() as i32),
        width: (selection.width * scale).round().max(1.0) as u32,
        height: (selection.height * scale).round().max(1.0) as u32,
        monitor_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_css_selection_to_physical_desktop_coordinates() {
        let region = physical_region(
            SelectionRect {
                x: 10.0,
                y: 20.0,
                width: 200.0,
                height: 100.0,
            },
            -1920,
            0,
            1.5,
            Some("secondary".into()),
        )
        .expect("valid selection");

        assert_eq!(region.x, -1905);
        assert_eq!(region.y, 30);
        assert_eq!(region.width, 300);
        assert_eq!(region.height, 150);
    }
}
