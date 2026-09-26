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
    let mut fragments = Vec::with_capacity(win_lines.Size().map_err(AppError::ocr)? as usize);
    for index in 0..win_lines.Size().map_err(AppError::ocr)? {
        let win_line = win_lines.GetAt(index).map_err(AppError::ocr)?;
        let text = normalize_line(&win_line.Text().map_err(AppError::ocr)?.to_string());
        if text.is_empty() {
            continue;
        }

        let words = win_line.Words().map_err(AppError::ocr)?;
        let mut bounds: Option<(f32, f32, f32, f32)> = None;
        for word_index in 0..words.Size().map_err(AppError::ocr)? {
            let rect = words
                .GetAt(word_index)
                .and_then(|word| word.BoundingRect())
                .map_err(AppError::ocr)?;
            let right = rect.X + rect.Width;
            let bottom = rect.Y + rect.Height;
            bounds = Some(match bounds {
                Some((left, top, current_right, current_bottom)) => (
                    left.min(rect.X),
                    top.min(rect.Y),
                    current_right.max(right),
                    current_bottom.max(bottom),
                ),
                None => (rect.X, rect.Y, right, bottom),
            });
        }

        let (x, y, right, bottom) = bounds.unwrap_or((0.0, index as f32, 0.0, index as f32));
        fragments.push(OcrLine {
            text,
            x,
            y,
            width: (right - x).max(0.0),
            height: (bottom - y).max(0.0),
        });
    }

    let lines = merge_visual_rows(fragments);
    let text = if lines.is_empty() {
        normalize_text(&result.Text().map_err(AppError::ocr)?.to_string())
    } else {
        format_layout(&lines)
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

fn merge_visual_rows(mut fragments: Vec<OcrLine>) -> Vec<OcrLine> {
    fragments.sort_by(|left, right| {
        left.y
            .total_cmp(&right.y)
            .then_with(|| left.x.total_cmp(&right.x))
    });

    let mut rows: Vec<Vec<OcrLine>> = Vec::new();
    for fragment in fragments {
        if let Some(row) = rows
            .iter_mut()
            .rev()
            .find(|row| belongs_to_same_row(row, &fragment))
        {
            row.push(fragment);
        } else {
            rows.push(vec![fragment]);
        }
    }

    let mut merged = rows.into_iter().map(merge_row).collect::<Vec<OcrLine>>();
    merged.sort_by(|left, right| {
        left.y
            .total_cmp(&right.y)
            .then_with(|| left.x.total_cmp(&right.x))
    });
    merged.dedup_by(|next, previous| next.text == previous.text);
    merged
}

fn belongs_to_same_row(row: &[OcrLine], fragment: &OcrLine) -> bool {
    let top = row.iter().map(|line| line.y).fold(f32::MAX, f32::min);
    let bottom = row
        .iter()
        .map(|line| line.y + line.height)
        .fold(f32::MIN, f32::max);
    let smallest_height = (bottom - top).min(fragment.height).max(1.0);
    let row_center = (top + bottom) / 2.0;
    let fragment_center = fragment.y + fragment.height / 2.0;
    (row_center - fragment_center).abs() <= smallest_height * 0.65
}

fn merge_row(mut fragments: Vec<OcrLine>) -> OcrLine {
    fragments.sort_by(|left, right| left.x.total_cmp(&right.x));
    let x = fragments.iter().map(|line| line.x).fold(f32::MAX, f32::min);
    let y = fragments.iter().map(|line| line.y).fold(f32::MAX, f32::min);
    let right = fragments
        .iter()
        .map(|line| line.x + line.width)
        .fold(f32::MIN, f32::max);
    let bottom = fragments
        .iter()
        .map(|line| line.y + line.height)
        .fold(f32::MIN, f32::max);

    let mut text = String::new();
    for fragment in fragments {
        append_text(&mut text, &fragment.text);
    }

    OcrLine {
        text,
        x,
        y,
        width: (right - x).max(0.0),
        height: (bottom - y).max(0.0),
    }
}

fn append_text(target: &mut String, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    let no_space_before = value.chars().next().is_some_and(|character| {
        matches!(
            character,
            ',' | '.' | ':' | ';' | '!' | '?' | ')' | ']' | '}'
        )
    });
    let no_space_after = target
        .chars()
        .next_back()
        .is_some_and(|character| matches!(character, '(' | '[' | '{' | '«'));
    if !target.is_empty() && !no_space_before && !no_space_after {
        target.push(' ');
    }
    target.push_str(value);
}

fn format_layout(lines: &[OcrLine]) -> String {
    let typical_height = median(
        lines
            .iter()
            .map(|line| line.height)
            .filter(|height| *height > 0.0)
            .collect(),
    )
    .unwrap_or(16.0);
    let base_x = median(lines.iter().skip(1).map(|line| line.x).collect()).unwrap_or(lines[0].x);
    let mut output = String::new();

    for (index, line) in lines.iter().enumerate() {
        if index == 0 {
            output.push_str(&line.text);
            continue;
        }

        let previous = &lines[index - 1];
        let vertical_gap = line.y - (previous.y + previous.height);
        let outdented = line.x + typical_height * 0.55 < previous.x;
        let aligned_to_base = line.x <= base_x + typical_height * 0.7;
        let sentence_boundary =
            ends_sentence(&previous.text) && starts_sentence(&line.text) && aligned_to_base;
        let paragraph_gap = vertical_gap > typical_height * 1.2;
        let separator = if starts_list_item(&line.text)
            || outdented
            || sentence_boundary
            || paragraph_gap
            || previous.text.ends_with(':')
        {
            "\n\n"
        } else if previous.text.ends_with('-') {
            ""
        } else {
            " "
        };
        output.push_str(separator);
        output.push_str(&line.text);
    }

    output
}

fn starts_list_item(value: &str) -> bool {
    ["• ", "· ", "- ", "– ", "— ", "* "]
        .iter()
        .any(|prefix| value.starts_with(prefix))
}

fn ends_sentence(value: &str) -> bool {
    value
        .chars()
        .next_back()
        .is_some_and(|character| matches!(character, '.' | '!' | '?' | ')' | ']' | '»'))
}

fn starts_sentence(value: &str) -> bool {
    value.chars().any(|character| character.is_alphanumeric())
}

fn median(mut values: Vec<f32>) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f32::total_cmp);
    Some(values[values.len() / 2])
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

    #[test]
    fn restores_rows_and_paragraphs_from_ocr_geometry() {
        let lines = vec![
            line("Implemented:", 0.0, 0.0, 120.0),
            line("Configurable shortcut Alt +", 12.0, 28.0, 220.0),
            line("Backquote", 238.0, 28.0, 70.0),
            line("works on every keyboard layout", 314.0, 28.0, 250.0),
            line("and is registered globally.", 30.0, 48.0, 220.0),
            line("Local OCR is enabled.", 12.0, 74.0, 190.0),
        ];

        let rows = merge_visual_rows(lines);
        assert_eq!(rows.len(), 4);
        assert_eq!(
            format_layout(&rows),
            "Implemented:\n\nConfigurable shortcut Alt + Backquote works on every keyboard layout and is registered globally.\n\nLocal OCR is enabled."
        );
    }

    fn line(text: &str, x: f32, y: f32, width: f32) -> OcrLine {
        OcrLine {
            text: text.into(),
            x,
            y,
            width,
            height: 16.0,
        }
    }
}
