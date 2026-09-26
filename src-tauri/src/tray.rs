use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use crate::{overlay, state::AppState};

pub fn install(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Capture Region", true, None::<&str>)?;
    let show_overlay = MenuItem::with_id(app, "show-overlay", "Show Overlay", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &show_overlay, &quit])?;

    let icon = tray_icon();
    TrayIconBuilder::new()
        .tooltip("Reply Overlay")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                if let Err(error) = overlay::show_main_window(tray.app_handle()) {
                    log::error!("tray left-click open failed: {error}");
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Err(error) = overlay::show_main_window(app) {
                    log::error!("tray open failed: {error}");
                }
            }
            "capture" => {
                let state = app.state::<AppState>();
                if let Err(error) = overlay::show_selection_overlays(app, &state) {
                    log::error!("tray capture failed: {error}");
                }
            }
            "show-overlay" => log::info!("reply overlay is scheduled for milestone 3"),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn tray_icon() -> tauri::image::Image<'static> {
    const SIZE: usize = 32;
    let mut rgba = vec![0_u8; SIZE * SIZE * 4];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let index = (y * SIZE + x) * 4;
            let inside = (4..28).contains(&x) && (4..28).contains(&y);
            if inside {
                rgba[index] = 124;
                rgba[index + 1] = 58;
                rgba[index + 2] = 237;
                rgba[index + 3] = 255;
            }
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE as u32, SIZE as u32)
}
