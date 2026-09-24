export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
  monitorId?: string
}

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CapturePayload {
  region: CaptureRegion
  dataUrl: string
  capturedAt: string
  durationMs: number
}
