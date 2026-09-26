<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RegionSummary from '@/components/RegionSummary.vue'
import HotkeyEditor from '@/components/HotkeyEditor.vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { useAppStore } from '@/stores/app'
import { useCaptureWorkflow } from '@/composables/useCaptureWorkflow'
import { toAppError } from '@/types/errors'
import { formatHotkeyLabel } from '@/utils/hotkey'
import { useAutoUpdater } from '@/composables/useAutoUpdater'

const store = useAppStore()
const { selecting, selectRegion } = useCaptureWorkflow()
const {
  checking: updateChecking,
  promptVisible: updatePromptVisible,
  installNow: installUpdate,
  keepCurrentVersion,
  showUpdate,
} = useAutoUpdater()
const copyLabel = ref('Копировать')

function saveHotkey(hotkey: string): void {
  void store.updateCaptureHotkey(hotkey)
}

async function copyOcrText(): Promise<void> {
  if (!store.ocrText) return
  try {
    await navigator.clipboard.writeText(store.ocrText)
    copyLabel.value = 'Скопировано'
  } catch (error: unknown) {
    store.reportError(toAppError(error).message)
  } finally {
    window.setTimeout(() => {
      copyLabel.value = 'Копировать'
    }, 1_500)
  }
}

onMounted(async () => {
  try {
    await store.initialize()
  } catch (error: unknown) {
    store.reportError(toAppError(error).message)
  }
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark">R</span>
        <div>
          <strong>ReplayPeek</strong>
          <span>gaming reply utility</span>
        </div>
      </div>
      <div class="topbar__actions">
        <button
          class="update-status"
          :class="{ 'update-status--error': store.updateStatus?.state === 'error' }"
          type="button"
          :disabled="updateChecking"
          @click="showUpdate"
        >
          <i :class="{ 'update-status__spinner': updateChecking }" />
          {{ store.updateStatus?.message ?? 'Проверить обновления' }}
        </button>
        <div
          class="status-pill"
          :class="{ 'status-pill--warning': !store.runtimeStatus?.hotkeyRegistered }"
        >
          <span />
          {{ store.runtimeStatus?.hotkeyRegistered ? 'Hotkey активен' : 'Hotkey недоступен' }}
        </div>
      </div>
    </header>

    <section class="hero-panel">
      <div class="hero-panel__copy">
        <span class="eyebrow">CAPTURE REGION</span>
        <h1>Выделите чат.<br />Остальное сделаем мы.</h1>
        <p>Нажмите глобальную комбинацию в любом приложении или запустите выбор отсюда.</p>
        <button class="primary-button" type="button" :disabled="selecting" @click="selectRegion">
          <span class="primary-button__icon">⌗</span>
          {{ selecting ? 'Открываем…' : 'Выбрать область' }}
          <kbd>{{
            formatHotkeyLabel(store.settings?.hotkeys.captureRegion ?? 'Ctrl+Shift+S')
          }}</kbd>
        </button>
      </div>

      <div class="capture-preview">
        <div v-if="store.lastCapture" class="capture-preview__image-wrap">
          <img :src="store.lastCapture.dataUrl" alt="Последний снимок выбранной области" />
          <span>{{ store.lastCapture.durationMs }} ms</span>
        </div>
        <div v-else class="capture-preview__empty">
          <div class="capture-preview__reticle" />
          <span>Здесь появится снимок</span>
        </div>
      </div>
    </section>

    <p v-if="store.errorMessage" class="error-banner" role="alert">
      <strong>Не удалось выполнить операцию.</strong> {{ store.errorMessage }}
    </p>

    <section class="dashboard-grid">
      <article class="panel panel--wide">
        <header class="panel__header">
          <div>
            <span class="eyebrow">ACTIVE AREA</span>
            <h2>Область захвата</h2>
          </div>
          <button class="ghost-button" type="button" @click="selectRegion">Изменить</button>
        </header>
        <RegionSummary :region="store.captureRegion" />
      </article>

      <article class="panel">
        <span class="eyebrow">HOTKEY</span>
        <h2>Глобальная клавиша</h2>
        <HotkeyEditor
          :model-value="store.settings?.hotkeys.captureRegion ?? 'Ctrl+Shift+S'"
          :saving="store.hotkeySaving"
          @save="saveHotkey"
        />
      </article>

      <article class="panel panel--ocr">
        <header class="panel__header">
          <div>
            <span class="eyebrow">WINDOWS OCR</span>
            <h2>Распознанный текст</h2>
          </div>
          <button
            class="ghost-button"
            type="button"
            :disabled="!store.ocrText"
            @click="copyOcrText"
          >
            {{ copyLabel }}
          </button>
        </header>
        <textarea
          v-model="store.ocrText"
          class="ocr-editor"
          spellcheck="false"
          :aria-busy="store.ocrProcessing"
          :placeholder="
            store.ocrProcessing
              ? 'Распознаём текст…'
              : 'После выделения области здесь появится распознанный текст'
          "
          rows="12"
        />
        <footer class="ocr-meta">
          <span v-if="store.ocrProcessing" class="ocr-meta__processing">
            <i />
            OCR работает в фоне — окно уже можно использовать
          </span>
          <span v-else-if="store.ocrErrorMessage" class="ocr-meta__error">
            {{ store.ocrErrorMessage }}
          </span>
          <span v-else-if="store.lastOcrResult">
            {{ store.lastOcrResult.language }} · {{ store.lastOcrResult.durationMs }} ms · можно
            исправить перед отправкой в AI
          </span>
          <span v-else>OCR выполняется локально, screenshot не отправляется в AI</span>
        </footer>
      </article>
    </section>

    <UpdatePrompt
      v-if="updatePromptVisible && store.updateStatus"
      :status="store.updateStatus"
      @update="installUpdate"
      @skip="keepCurrentVersion"
    />
  </main>
</template>
