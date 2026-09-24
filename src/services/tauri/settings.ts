import type { AppSettings } from '@/types/settings'
import { invokeCommand } from './client'

export function loadSettings(): Promise<AppSettings> {
  return invokeCommand<AppSettings>('get_settings')
}

export function persistSettings(settings: AppSettings): Promise<AppSettings> {
  return invokeCommand<AppSettings>('save_settings', { settings })
}
