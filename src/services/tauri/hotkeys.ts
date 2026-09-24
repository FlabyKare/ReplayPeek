import type { AppSettings } from '@/types/settings'
import { invokeCommand } from './client'

export function setCaptureHotkey(hotkey: string): Promise<AppSettings> {
  return invokeCommand<AppSettings>('update_capture_hotkey', { hotkey })
}
