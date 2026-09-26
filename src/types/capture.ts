import type { AppErrorPayload } from './errors'

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
  ocrResult: OcrResult | null
  ocrError: AppErrorPayload | null
}

export interface OcrLine {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface OcrResult {
  text: string
  language: string
  lines: OcrLine[]
  durationMs: number
}
