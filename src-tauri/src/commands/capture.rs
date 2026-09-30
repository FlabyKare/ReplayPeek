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
    let monitor = window
        .current_monitor()
        .map_err(AppError::window)?
        .ok_or_else(|| AppError::new("monitor_missing", "Не найден монитор окна выделения"))?;
    let scale = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();
    let monitor_name = monitor.name().map(ToOwned::to_owned);

    let region = physical_region(
        selection,
        position.x,
        position.y,
        size.width,
        size.height,
        scale,
        monitor_name,
    )?;
    state.settings.set_capture_region(region.clone())?;
    overlay::hide_selection_overlays(&app)?;

    let capture = state.capture.clone();
    let ocr_language = state.settings.get().language;
    let region_for_capture = region.clone();
    let started = Instant::now();
    let task = tauri::async_runtime::spawn_blocking(move || {
        // DwmFlush in hide_selection_overlays waits for composition. Two extra
        // desktop frames cover capture backends that read a slightly older frame.
        std::thread::sleep(std::time::Duration::from_millis(50));
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
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
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

    let left = (selection.x * scale).floor().max(0.0) as u32;
    let top = (selection.y * scale).floor().max(0.0) as u32;
    let right = ((selection.x + selection.width) * scale).ceil().max(1.0) as u32;
    let bottom = ((selection.y + selection.height) * scale).ceil().max(1.0) as u32;
    let left = left.min(monitor_width.saturating_sub(1));
    let top = top.min(monitor_height.saturating_sub(1));
    let right = right.clamp(left.saturating_add(1), monitor_width);
    let bottom = bottom.clamp(top.saturating_add(1), monitor_height);

    Ok(CaptureRegion {
        x: monitor_x.saturating_add(left as i32),
        y: monitor_y.saturating_add(top as i32),
        width: right - left,
        height: bottom - top,
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
            2560,
            1440,
            1.5,
            Some("secondary".into()),
        )
        .expect("valid selection");

        assert_eq!(region.x, -1905);
        assert_eq!(region.y, 30);
        assert_eq!(region.width, 300);
        assert_eq!(region.height, 150);
    }

    #[test]
    fn rounds_physical_edges_instead_of_accumulating_width_error() {
        let region = physical_region(
            SelectionRect {
                x: 10.4,
                y: 20.4,
                width: 10.4,
                height: 10.4,
            },
            0,
            0,
            1920,
            1080,
            1.25,
            None,
        )
        .expect("valid selection");

        assert_eq!(region.x, 13);
        assert_eq!(region.y, 25);
        assert_eq!(region.width, 13);
        assert_eq!(region.height, 14);
    }

    #[test]
    fn clamps_selection_to_monitor_bounds() {
        let region = physical_region(
            SelectionRect {
                x: 95.0,
                y: 45.0,
                width: 20.0,
                height: 20.0,
            },
            -100,
            200,
            100,
            50,
            1.0,
            None,
        )
        .expect("valid selection");

        assert_eq!(region.x, -5);
        assert_eq!(region.y, 245);
        assert_eq!(region.width, 5);
        assert_eq!(region.height, 5);
    }
}
