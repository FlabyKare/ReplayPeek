mod preprocessing;
mod windows_ocr;

use crate::{capture::CapturedFrame, error::AppResult, models::OcrResult};

pub use windows_ocr::WindowsOcrEngine;

pub trait OcrEngine: Send + Sync {
    fn recognize(&self, frame: &CapturedFrame, language: &str) -> AppResult<OcrResult>;
}
