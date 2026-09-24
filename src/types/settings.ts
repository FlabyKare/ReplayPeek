import type { CaptureRegion } from './capture'

export type ReplyStyle = 'sarcastic' | 'funny' | 'calm' | 'smart'
export type AppLanguage = 'ru' | 'en'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AppSettings {
  captureRegion: CaptureRegion | null
  hotkeys: {
    captureRegion: string
    toggleMonitoring: string | null
    toggleOverlay: string | null
    toggleInteraction: string | null
  }
  replyStyle: ReplyStyle
  language: AppLanguage
  overlayBounds: WindowBounds
  captureFps: number
}
