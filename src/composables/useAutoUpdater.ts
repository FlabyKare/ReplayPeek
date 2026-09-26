import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '@/stores/app'
import { checkForUpdates, installAvailableUpdate, onUpdateStatus } from '@/services/tauri/updates'
import { toAppError } from '@/types/errors'

export function useAutoUpdater() {
  const skippedVersionKey = 'replaypeek.skippedUpdateVersion'
  const store = useAppStore()
  let unlisten: UnlistenFn | null = null
  const skippedVersion = ref(localStorage.getItem(skippedVersionKey))

  const updateAvailable = computed(() => store.updateStatus?.state === 'available')
  const promptVisible = computed(
    () =>
      updateAvailable.value &&
      store.updateStatus?.version !== null &&
      store.updateStatus?.version !== skippedVersion.value,
  )

  const checking = computed(() => {
    const state = store.updateStatus?.state
    return state === 'checking' || state === 'downloading' || state === 'installing'
  })

  async function checkNow(): Promise<void> {
    try {
      await checkForUpdates()
    } catch (error: unknown) {
      const appError = toAppError(error)
      if (appError.code !== 'update_in_progress') store.reportError(appError.message)
    }
  }

  async function installNow(): Promise<void> {
    try {
      await installAvailableUpdate()
    } catch (error: unknown) {
      const appError = toAppError(error)
      if (appError.code !== 'update_in_progress') store.reportError(appError.message)
    }
  }

  function keepCurrentVersion(): void {
    const version = store.updateStatus?.version
    if (!version) return
    skippedVersion.value = version
    localStorage.setItem(skippedVersionKey, version)
  }

  function showUpdate(): void {
    if (updateAvailable.value) {
      skippedVersion.value = null
      localStorage.removeItem(skippedVersionKey)
      return
    }
    void checkNow()
  }

  onMounted(async () => {
    try {
      unlisten = await onUpdateStatus((status) => store.acceptUpdateStatus(status))
    } catch (error: unknown) {
      store.reportError(toAppError(error).message)
    }
  })

  onBeforeUnmount(() => unlisten?.())

  return {
    checking,
    updateAvailable,
    promptVisible,
    checkNow,
    installNow,
    keepCurrentVersion,
    showUpdate,
  }
}
