use xcap::Monitor;

use super::{CapturedFrame, ScreenCapture};
use crate::{error::AppResult, models::CaptureRegion};

#[derive(Default)]
pub struct XcapScreenCapture;

impl ScreenCapture for XcapScreenCapture {
    fn capture_region(&self, region: &CaptureRegion) -> AppResult<CapturedFrame> {
        let sample_x = region.x.saturating_add(1);
        let sample_y = region.y.saturating_add(1);
        let monitor =
            Monitor::from_point(sample_x, sample_y).map_err(crate::error::AppError::capture)?;
        let monitor_x = monitor.x().map_err(crate::error::AppError::capture)?;
        let monitor_y = monitor.y().map_err(crate::error::AppError::capture)?;
        let local_x = u32::try_from(region.x.saturating_sub(monitor_x)).map_err(|_| {
            crate::error::AppError::new(
                "capture_out_of_bounds",
                "Область выходит за левую границу монитора",
            )
        })?;
        let local_y = u32::try_from(region.y.saturating_sub(monitor_y)).map_err(|_| {
            crate::error::AppError::new(
                "capture_out_of_bounds",
                "Область выходит за верхнюю границу монитора",
            )
        })?;

        let image = monitor
            .capture_region(local_x, local_y, region.width, region.height)
            .map_err(crate::error::AppError::capture)?;

        Ok(CapturedFrame {
            width: image.width(),
            height: image.height(),
            rgba: image.into_raw(),
        })
    }
}
