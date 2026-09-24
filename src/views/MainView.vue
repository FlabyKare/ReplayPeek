<script setup lang="ts">
import { onMounted } from 'vue'
import RegionSummary from '@/components/RegionSummary.vue'
import { useAppStore } from '@/stores/app'
import { useCaptureWorkflow } from '@/composables/useCaptureWorkflow'
import { toAppError } from '@/types/errors'

const store = useAppStore()
const { selecting, selectRegion } = useCaptureWorkflow()

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
          <strong>Reply Overlay</strong>
          <span>gaming reply utility</span>
        </div>
      </div>
      <div
        class="status-pill"
        :class="{ 'status-pill--warning': !store.runtimeStatus?.hotkeyRegistered }"
      >
        <span />
        {{ store.runtimeStatus?.hotkeyRegistered ? 'Hotkey активен' : 'Hotkey недоступен' }}
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
          <kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>S</kbd>
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
        <div class="setting-row">
          <span>Capture region</span>
          <code>{{ store.settings?.hotkeys.captureRegion ?? 'Ctrl+Shift+S' }}</code>
        </div>
      </article>

      <article class="panel panel--muted">
        <span class="eyebrow">NEXT MILESTONE</span>
        <h2>OCR и AI-ответы</h2>
        <p>Движок распознавания и floating overlay подключаются следующим этапом.</p>
        <div class="tag-row"><span>OCR</span><span>Mock AI</span><span>History</span></div>
      </article>
    </section>
  </main>
</template>
