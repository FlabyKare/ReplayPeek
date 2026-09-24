import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '@/stores/app'
import { onCaptureCompleted, onNativeError, startRegionSelection } from '@/services/tauri/capture'
import { toAppError } from '@/types/errors'

export function useCaptureWorkflow() {
  const store = useAppStore()
  const selecting = ref(false)
  const unlisteners: UnlistenFn[] = []

  async function selectRegion(): Promise<void> {
    selecting.value = true
    try {
      await startRegionSelection()
    } catch (error: unknown) {
      store.reportError(toAppError(error).message)
    } finally {
      selecting.value = false
    }
  }

  onMounted(async () => {
    try {
      unlisteners.push(
        await onCaptureCompleted((capture) => store.acceptCapture(capture)),
        await onNativeError((error) => store.reportError(error.message)),
      )
    } catch (error: unknown) {
      store.reportError(toAppError(error).message)
    }
  })

  onBeforeUnmount(() => {
    for (const unlisten of unlisteners) unlisten()
  })

  return { selecting, selectRegion }
}
