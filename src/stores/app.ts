import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { CapturePayload, OcrResult } from '@/types/capture'
import type { AppSettings } from '@/types/settings'
import { loadSettings } from '@/services/tauri/settings'
import { getRuntimeStatus } from '@/services/tauri/system'
import { setCaptureHotkey } from '@/services/tauri/hotkeys'
import { toAppError, type RuntimeStatus } from '@/types/errors'
import { normalizeOcrText } from '@/utils/text'
import type { UpdateStatus } from '@/types/update'

export const useAppStore = defineStore('app', () => {
  const settings = ref<AppSettings | null>(null)
  const lastCapture = ref<CapturePayload | null>(null)
  const lastOcrResult = ref<OcrResult | null>(null)
  const ocrText = ref('')
  const ocrErrorMessage = ref<string | null>(null)
  const ocrProcessing = ref(false)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const runtimeStatus = ref<RuntimeStatus | null>(null)
  const hotkeySaving = ref(false)
  const updateStatus = ref<UpdateStatus | null>(null)

  const captureRegion = computed(
    () => lastCapture.value?.region ?? settings.value?.captureRegion ?? null,
  )

  async function initialize(): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
      const [savedSettings, status] = await Promise.all([loadSettings(), getRuntimeStatus()])
      settings.value = savedSettings
      runtimeStatus.value = status
      errorMessage.value = status.warning?.message ?? null
    } finally {
      loading.value = false
    }
  }

  function acceptCapture(capture: CapturePayload): void {
    lastCapture.value = capture
    lastOcrResult.value = capture.ocrResult
    ocrText.value = normalizeOcrText(capture.ocrResult?.text ?? '')
    ocrErrorMessage.value = capture.ocrError?.message ?? null
    ocrProcessing.value = false
    if (settings.value) settings.value.captureRegion = capture.region
    errorMessage.value = null
  }

  function startOcrProcessing(): void {
    ocrProcessing.value = true
    ocrErrorMessage.value = null
  }

  function reportError(message: string): void {
    errorMessage.value = message
  }

  function acceptUpdateStatus(status: UpdateStatus): void {
    updateStatus.value = status
  }

  async function updateCaptureHotkey(hotkey: string): Promise<boolean> {
    hotkeySaving.value = true
    errorMessage.value = null
    try {
      settings.value = await setCaptureHotkey(hotkey)
      runtimeStatus.value = await getRuntimeStatus()
      return true
    } catch (error: unknown) {
      reportError(toAppError(error).message)
      return false
    } finally {
      hotkeySaving.value = false
    }
  }

  return {
    settings,
    lastCapture,
    lastOcrResult,
    ocrText,
    ocrErrorMessage,
    ocrProcessing,
    loading,
    errorMessage,
    runtimeStatus,
    hotkeySaving,
    updateStatus,
    captureRegion,
    initialize,
    acceptCapture,
    startOcrProcessing,
    reportError,
    acceptUpdateStatus,
    updateCaptureHotkey,
  }
})
