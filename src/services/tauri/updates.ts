import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invokeCommand } from './client'
import type { UpdateStatus } from '@/types/update'

const UPDATE_STATUS_EVENT = 'update://status'

export function checkForUpdates(): Promise<void> {
  return invokeCommand<void>('check_for_updates')
}

export function installAvailableUpdate(): Promise<void> {
  return invokeCommand<void>('install_available_update')
}

export function onUpdateStatus(handler: (status: UpdateStatus) => void): Promise<UnlistenFn> {
  return listen<UpdateStatus>(UPDATE_STATUS_EVENT, (event) => handler(event.payload))
}
