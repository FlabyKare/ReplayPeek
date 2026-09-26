mod settings_repository;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use parking_lot::Mutex;

use crate::capture::{ScreenCapture, XcapScreenCapture};
use crate::error::AppError;
use crate::ocr::{OcrEngine, WindowsOcrEngine};

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
    pub ocr: Arc<dyn OcrEngine>,
    pub session: Mutex<SessionState>,
    pub runtime: Mutex<RuntimeState>,
    pub update_in_progress: AtomicBool,
}

impl AppState {
    pub fn new(settings: SettingsRepository) -> Self {
        Self {
            settings,
            capture: Arc::new(XcapScreenCapture),
            ocr: Arc::new(WindowsOcrEngine),
            session: Mutex::new(SessionState::default()),
            runtime: Mutex::new(RuntimeState::default()),
            update_in_progress: AtomicBool::new(false),
        }
    }

    pub fn begin_update_check(&self) -> bool {
        self.update_in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    pub fn finish_update_check(&self) {
        self.update_in_progress.store(false, Ordering::Release);
    }
}
