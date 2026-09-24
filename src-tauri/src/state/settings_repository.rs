use std::{fs, path::PathBuf};

use parking_lot::RwLock;

use crate::{
    error::{AppError, AppResult},
    models::{AppSettings, CaptureRegion},
};

pub struct SettingsRepository {
    path: PathBuf,
    value: RwLock<AppSettings>,
}

impl SettingsRepository {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        let value = if path.exists() {
            let bytes = fs::read(&path).map_err(|error| AppError::io("Чтение настроек", error))?;
            serde_json::from_slice(&bytes).map_err(|error| {
                AppError::new(
                    "settings_invalid",
                    format!("Некорректный файл настроек: {error}"),
                )
            })?
        } else {
            AppSettings::default()
        };

        Ok(Self {
            path,
            value: RwLock::new(value),
        })
    }

    pub fn get(&self) -> AppSettings {
        self.value.read().clone()
    }

    pub fn replace(&self, settings: AppSettings) -> AppResult<AppSettings> {
        validate_settings(&settings)?;
        self.persist(&settings)?;
        *self.value.write() = settings.clone();
        Ok(settings)
    }

    pub fn set_capture_region(&self, region: CaptureRegion) -> AppResult<()> {
        let mut settings = self.value.read().clone();
        settings.capture_region = Some(region);
        self.persist(&settings)?;
        *self.value.write() = settings;
        Ok(())
    }

    fn persist(&self, settings: &AppSettings) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| AppError::io("Создание каталога настроек", error))?;
        }
        let bytes = serde_json::to_vec_pretty(settings)
            .map_err(|error| AppError::new("settings_serialize", error.to_string()))?;
        fs::write(&self.path, bytes).map_err(|error| AppError::io("Сохранение настроек", error))
    }
}

fn validate_settings(settings: &AppSettings) -> AppResult<()> {
    if settings.capture_fps == 0 || settings.capture_fps > 10 {
        return Err(AppError::new(
            "settings_invalid",
            "Частота захвата должна быть от 1 до 10 кадров/с",
        ));
    }
    if !matches!(settings.language.as_str(), "ru" | "en") {
        return Err(AppError::new("settings_invalid", "Неподдерживаемый язык"));
    }
    if !matches!(
        settings.reply_style.as_str(),
        "sarcastic" | "funny" | "calm" | "smart"
    ) {
        return Err(AppError::new(
            "settings_invalid",
            "Неподдерживаемый стиль ответа",
        ));
    }
    Ok(())
}
