use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error, Serialize)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn io(context: &str, error: impl std::fmt::Display) -> Self {
        Self::new("io_error", format!("{context}: {error}"))
    }

    pub fn capture(error: impl std::fmt::Display) -> Self {
        Self::new(
            "capture_error",
            format!("Не удалось сделать снимок: {error}"),
        )
    }

    pub fn window(error: impl std::fmt::Display) -> Self {
        Self::new("window_error", format!("Ошибка окна: {error}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
