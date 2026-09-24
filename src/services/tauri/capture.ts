import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { CapturePayload, SelectionRect } from '@/types/capture'
import type { AppErrorPayload } from '@/types/errors'
import { invokeCommand } from './client'

export function startRegionSelection(): Promise<void> {
  return invokeCommand<void>('start_region_selection')
}

export function completeRegionSelection(selection: SelectionRect): Promise<CapturePayload> {
  return invokeCommand<CapturePayload>('complete_region_selection', { selection })
}

export function cancelRegionSelection(): Promise<void> {
  return invokeCommand<void>('cancel_region_selection')
}

export function onCaptureCompleted(
  listener: (payload: CapturePayload) => void,
): Promise<UnlistenFn> {
  return listen<CapturePayload>('capture://completed', (event) => listener(event.payload))
}

export function onNativeError(listener: (payload: AppErrorPayload) => void): Promise<UnlistenFn> {
  return listen<AppErrorPayload>('error://reported', (event) => listener(event.payload))
}
