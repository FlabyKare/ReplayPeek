mod settings_repository;

use std::sync::Arc;

use parking_lot::Mutex;

use crate::capture::{ScreenCapture, XcapScreenCapture};
use crate::error::AppError;

pub use settings_repository::SettingsRepository;

#[derive(Default)]
pub struct SessionState {
    pub main_was_visible: bool,
}

#[derive(Default)]
pub struct RuntimeState {
    pub hotkey_registered: bool,
    pub startup_warning: Option<AppError>,
}

pub struct AppState {
    pub settings: SettingsRepository,
    pub capture: Arc<dyn ScreenCapture>,
    pub session: Mutex<SessionState>,
    pub runtime: Mutex<RuntimeState>,
}

impl AppState {
    pub fn new(settings: SettingsRepository) -> Self {
        Self {
            settings,
            capture: Arc::new(XcapScreenCapture),
            session: Mutex::new(SessionState::default()),
            runtime: Mutex::new(RuntimeState::default()),
        }
    }
}
