use std::io::Cursor;

use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};

use crate::{
    capture::CapturedFrame,
    error::{AppError, AppResult},
};

pub fn image_from_frame(frame: &CapturedFrame) -> AppResult<DynamicImage> {
    ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(frame.width, frame.height, frame.rgba.clone())
        .map(DynamicImage::ImageRgba8)
        .ok_or_else(|| AppError::new("image_invalid", "Некорректный RGBA-буфер для OCR"))
}

pub fn improve_game_text(image: &DynamicImage, max_dimension: u32) -> DynamicImage {
    let longest_side = image.width().max(image.height()).max(1);
    let desired_scale: f32 = if longest_side < 1_300 { 2.0 } else { 1.35 };
    let max_scale = max_dimension as f32 / longest_side as f32;
    let scale = desired_scale.min(max_scale).max(0.1);
    let width = ((image.width() as f32 * scale).round() as u32).max(1);
    let height = ((image.height() as f32 * scale).round() as u32).max(1);

    image
        .grayscale()
        .adjust_contrast(32.0)
        .resize_exact(width, height, image::imageops::FilterType::Lanczos3)
        .unsharpen(1.1, 1)
}

pub fn encode_png(image: &DynamicImage) -> AppResult<Vec<u8>> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(AppError::ocr)?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preprocessing_respects_windows_ocr_dimension_limit() {
        let image = DynamicImage::new_rgba8(2_000, 1_000);
        let processed = improve_game_text(&image, 2_600);

        assert_eq!(processed.width(), 2_600);
        assert_eq!(processed.height(), 1_300);
    }
}
