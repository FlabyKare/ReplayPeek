mod xcap_capture;

use crate::{error::AppResult, models::CaptureRegion};

pub use xcap_capture::XcapScreenCapture;

pub struct CapturedFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub trait ScreenCapture: Send + Sync {
    fn capture_region(&self, region: &CaptureRegion) -> AppResult<CapturedFrame>;
}
