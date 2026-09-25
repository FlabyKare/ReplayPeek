use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitor_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePayload {
    pub region: CaptureRegion,
    pub data_url: String,
    pub captured_at: String,
    pub duration_ms: u128,
    pub ocr_result: Option<OcrResult>,
    pub ocr_error: Option<crate::error::AppError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub language: String,
    pub lines: Vec<OcrLine>,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySettings {
    pub capture_region: String,
    pub toggle_monitoring: Option<String>,
    pub toggle_overlay: Option<String>,
    pub toggle_interaction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub capture_region: Option<CaptureRegion>,
    pub hotkeys: HotkeySettings,
    pub reply_style: String,
    pub language: String,
    pub overlay_bounds: WindowBounds,
    pub capture_fps: u8,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            capture_region: None,
            hotkeys: HotkeySettings {
                capture_region: "Ctrl+Shift+S".into(),
                toggle_monitoring: None,
                toggle_overlay: None,
                toggle_interaction: None,
            },
            reply_style: "funny".into(),
            language: "ru".into(),
            overlay_bounds: WindowBounds {
                x: 80,
                y: 80,
                width: 420,
                height: 260,
            },
            capture_fps: 2,
        }
    }
}
