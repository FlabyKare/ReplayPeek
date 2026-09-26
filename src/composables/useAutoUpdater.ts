import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '@/stores/app'
import { checkForUpdates, onUpdateStatus } from '@/services/tauri/updates'
import { toAppError } from '@/types/errors'

export function useAutoUpdater() {
  const store = useAppStore()
  let unlisten: UnlistenFn | null = null

  const checking = computed(() => {
    const state = store.updateStatus?.state
    return (
      state === 'checking' ||
      state === 'available' ||
      state === 'downloading' ||
      state === 'installing'
    )
  })

  async function checkNow(): Promise<void> {
    try {
      await checkForUpdates()
    } catch (error: unknown) {
      const appError = toAppError(error)
      if (appError.code !== 'update_in_progress') store.reportError(appError.message)
    }
  }

  onMounted(async () => {
    try {
      unlisten = await onUpdateStatus((status) => store.acceptUpdateStatus(status))
    } catch (error: unknown) {
      store.reportError(toAppError(error).message)
    }
  })

  onBeforeUnmount(() => unlisten?.())

  return { checking, checkNow }
}
