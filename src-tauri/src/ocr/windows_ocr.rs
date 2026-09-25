use std::time::Instant;

use windows::{
    core::HSTRING,
    Globalization::Language,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::{OcrEngine as WinOcrEngine, OcrResult as WinOcrResult},
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
};

use crate::{
    capture::CapturedFrame,
    error::{AppError, AppResult},
    models::{OcrLine, OcrResult},
};

use super::{preprocessing, OcrEngine};

pub struct WindowsOcrEngine;

struct WinRtApartment;

impl WinRtApartment {
    fn initialize() -> AppResult<Self> {
        // OCR runs on a blocking worker, so that worker needs its own WinRT apartment.
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(AppError::ocr)?;
        Ok(Self)
    }
}

impl Drop for WinRtApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

#[derive(Clone)]
struct Candidate {
    text: String,
    lines: Vec<OcrLine>,
}

impl OcrEngine for WindowsOcrEngine {
    fn recognize(&self, frame: &CapturedFrame, language: &str) -> AppResult<OcrResult> {
        let started = Instant::now();
        let _apartment = WinRtApartment::initialize()?;
        let engine = create_engine(language)?;
        let actual_language = engine
            .RecognizerLanguage()
            .and_then(|value| value.LanguageTag())
            .map(|value| value.to_string())
            .unwrap_or_else(|_| language.to_string());

        let image = preprocessing::image_from_frame(frame)?;
        let max_dimension = WinOcrEngine::MaxImageDimension().map_err(AppError::ocr)?;
        let improved = preprocessing::improve_game_text(&image, max_dimension);

        let original = recognize_png(&engine, &preprocessing::encode_png(&image)?);
        let enhanced = recognize_png(&engine, &preprocessing::encode_png(&improved)?);
        let candidate = choose_candidate(original, enhanced)?;

        Ok(OcrResult {
            text: candidate.text,
            language: actual_language,
            lines: candidate.lines,
            duration_ms: started.elapsed().as_millis(),
        })
    }
}

fn create_engine(language: &str) -> AppResult<WinOcrEngine> {
    let language_tag = match language {
        "en" => "en-US",
        _ => "ru-RU",
    };
    let requested =
        Language::CreateLanguage(&HSTRING::from(language_tag)).map_err(AppError::ocr)?;
    if WinOcrEngine::IsLanguageSupported(&requested).map_err(AppError::ocr)? {
        return WinOcrEngine::TryCreateFromLanguage(&requested).map_err(AppError::ocr);
    }

    WinOcrEngine::TryCreateFromUserProfileLanguages().map_err(|error| {
        AppError::new(
            "ocr_language_missing",
            format!(
                "В Windows не установлен OCR-язык {language_tag}. Добавьте языковой пакет в Settings → Time & language: {error}"
            ),
        )
    })
}

fn recognize_png(engine: &WinOcrEngine, png: &[u8]) -> AppResult<Candidate> {
    let stream = InMemoryRandomAccessStream::new().map_err(AppError::ocr)?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(AppError::ocr)?;
    writer.WriteBytes(png).map_err(AppError::ocr)?;
    writer
        .StoreAsync()
        .and_then(|operation| operation.get())
        .map_err(AppError::ocr)?;
    writer
        .FlushAsync()
        .and_then(|operation| operation.get())
        .map_err(AppError::ocr)?;
    writer.DetachStream().map_err(AppError::ocr)?;
    stream.Seek(0).map_err(AppError::ocr)?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .and_then(|operation| operation.get())
        .map_err(AppError::ocr)?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .and_then(|operation| operation.get())
        .map_err(AppError::ocr)?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .and_then(|operation| operation.get())
        .map_err(AppError::ocr)?;
    candidate_from_result(&result)
}

fn candidate_from_result(result: &WinOcrResult) -> AppResult<Candidate> {
    let win_lines = result.Lines().map_err(AppError::ocr)?;
    let mut lines = Vec::with_capacity(win_lines.Size().map_err(AppError::ocr)? as usize);
    for index in 0..win_lines.Size().map_err(AppError::ocr)? {
        let text = win_lines
            .GetAt(index)
            .and_then(|line| line.Text())
            .map_err(AppError::ocr)?
            .to_string();
        let text = normalize_line(&text);
        if !text.is_empty()
            && lines
                .last()
                .map_or(true, |previous: &OcrLine| previous.text != text)
        {
            lines.push(OcrLine { text });
        }
    }

    let text = if lines.is_empty() {
        normalize_text(&result.Text().map_err(AppError::ocr)?.to_string())
    } else {
        lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    };
    Ok(Candidate { text, lines })
}

fn choose_candidate(
    original: AppResult<Candidate>,
    enhanced: AppResult<Candidate>,
) -> AppResult<Candidate> {
    match (original, enhanced) {
        (Ok(original), Ok(enhanced)) => {
            if text_score(&enhanced.text) > text_score(&original.text) {
                Ok(enhanced)
            } else {
                Ok(original)
            }
        }
        (Ok(candidate), Err(_)) | (Err(_), Ok(candidate)) => Ok(candidate),
        (Err(original), Err(enhanced)) => Err(AppError::new(
            "ocr_error",
            format!("OCR оригинала: {original}; OCR после обработки: {enhanced}"),
        )),
    }
}

fn normalize_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_text(value: &str) -> String {
    value
        .lines()
        .map(normalize_line)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn text_score(value: &str) -> usize {
    let meaningful = value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .count();
    meaningful * 3
        + value
            .chars()
            .filter(|character| !character.is_whitespace())
            .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_whitespace_and_empty_lines() {
        assert_eq!(
            normalize_text("  first   line\r\n\r\n second  "),
            "first line\nsecond"
        );
    }

    #[test]
    fn prefers_candidate_with_more_meaningful_text() {
        assert!(text_score("Player228: hello") > text_score("Player2"));
    }
}
