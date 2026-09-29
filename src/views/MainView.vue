<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import DashboardGrid from '@/components/DashboardGrid.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import { useAppStore } from '@/stores/app'
import { useCloudStore } from '@/stores/cloud'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCaptureWorkflow } from '@/composables/useCaptureWorkflow'
import { toAppError } from '@/types/errors'
import { formatHotkeyLabel } from '@/utils/hotkey'
import { useAutoUpdater } from '@/composables/useAutoUpdater'

const store = useAppStore()
const cloud = useCloudStore()
const workspace = useWorkspaceStore()
const { selecting, selectRegion } = useCaptureWorkflow()
const {
  checking: updateChecking,
  promptVisible: updatePromptVisible,
  installNow: installUpdate,
  keepCurrentVersion,
  showUpdate,
} = useAutoUpdater()
const copyLabel = ref('Копировать')
const settingsOpen = ref(false)

function saveHotkey(hotkey: string): void {
  void store.updateCaptureHotkey(hotkey)
}

function createProfile(name: string): void {
  if (!store.settings) return
  const profileId = workspace.createProfile(name, store.settings)
  void store.switchProfile(profileId)
}

function toggleLayoutEditing(): void {
  workspace.layoutEditing = !workspace.layoutEditing
  settingsOpen.value = false
}

async function connectTelegram(): Promise<void> {
  const restored = await cloud.connect(workspace)
  if (restored) await store.applyActiveProfileSettings()
}

async function syncCloudNow(): Promise<void> {
  await cloud.upload(workspace.snapshot())
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
    const restored = await cloud.initialize(workspace)
    if (restored) await store.applyActiveProfileSettings()
    workspace.$subscribe(
      () => {
        cloud.scheduleUpload(workspace.snapshot())
      },
      { detached: true },
    )
  } catch (error: unknown) {
    store.reportError(toAppError(error).message)
  }
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <button class="brand" type="button" title="Открыть настройки" @click="settingsOpen = true">
        <span class="brand__mark">R</span>
        <div>
          <strong>ReplayPeek</strong>
          <span>gaming reply utility</span>
        </div>
      </button>
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

    <div v-if="workspace.layoutEditing" class="layout-edit-banner">
      <span>Перетаскивайте блоки за ⠿ и меняйте их размер кнопками.</span>
      <button class="ghost-button" type="button" @click="workspace.layoutEditing = false">
        Готово
      </button>
    </div>

    <DashboardGrid
      :layout="workspace.dashboardLayout"
      :editing="workspace.layoutEditing"
      :capture-region="store.captureRegion"
      :settings="store.settings"
      :hotkey-saving="store.hotkeySaving"
      :ocr-text="store.ocrText"
      :ocr-processing="store.ocrProcessing"
      :ocr-error-message="store.ocrErrorMessage"
      :last-ocr-result="store.lastOcrResult"
      :copy-label="copyLabel"
      @move="workspace.moveBlock"
      @resize="workspace.resizeBlock"
      @select-region="selectRegion"
      @save-hotkey="saveHotkey"
      @copy-ocr="copyOcrText"
      @update:ocr-text="store.ocrText = $event"
    />

    <SettingsDrawer
      :open="settingsOpen"
      :profiles="workspace.profiles"
      :active-profile-id="workspace.activeProfileId"
      :settings="store.settings"
      :layout-editing="workspace.layoutEditing"
      :cloud-user="cloud.user"
      :cloud-busy="cloud.busy"
      :cloud-message="cloud.message"
      @close="settingsOpen = false"
      @create-profile="createProfile"
      @select-profile="store.switchProfile"
      @rename-profile="workspace.renameProfile"
      @delete-profile="workspace.deleteProfile"
      @update-preferences="store.updatePreferences"
      @toggle-layout-editing="toggleLayoutEditing"
      @reset-layout="workspace.resetLayout"
      @connect-telegram="connectTelegram"
      @disconnect-telegram="cloud.disconnect"
      @sync-cloud="syncCloudNow"
    />

    <UpdatePrompt
      v-if="updatePromptVisible && store.updateStatus"
      :status="store.updateStatus"
      @update="installUpdate"
      @skip="keepCurrentVersion"
    />
  </main>
</template>
