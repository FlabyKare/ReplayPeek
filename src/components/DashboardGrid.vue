<script setup lang="ts">
import RegionSummary from '@/components/RegionSummary.vue'
import HotkeyEditor from '@/components/HotkeyEditor.vue'
import type { CaptureRegion, OcrResult } from '@/types/capture'
import type {
  DashboardBlockHeight,
  DashboardBlockId,
  DashboardBlockLayout,
  DashboardBlockSpan,
} from '@/types/profile'
import type { AppSettings } from '@/types/settings'

const props = defineProps<{
  layout: DashboardBlockLayout[]
  editing: boolean
  captureRegion: CaptureRegion | null
  settings: AppSettings | null
  hotkeySaving: boolean
  ocrText: string
  ocrProcessing: boolean
  ocrErrorMessage: string | null
  lastOcrResult: OcrResult | null
  copyLabel: string
}>()

const emit = defineEmits<{
  move: [sourceId: DashboardBlockId, targetId: DashboardBlockId]
  resize: [blockId: DashboardBlockId, span: DashboardBlockSpan, height: DashboardBlockHeight]
  selectRegion: []
  saveHotkey: [hotkey: string]
  copyOcr: []
  'update:ocrText': [value: string]
}>()

let draggedBlock: DashboardBlockId | null = null
const heights: DashboardBlockHeight[] = ['compact', 'normal', 'tall']

function startDragging(blockId: DashboardBlockId, event: DragEvent): void {
  if (!props.editing) return
  draggedBlock = blockId
  event.dataTransfer?.setData('text/plain', blockId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function dropOn(targetId: DashboardBlockId): void {
  if (draggedBlock) emit('move', draggedBlock, targetId)
  draggedBlock = null
}

function toggleSpan(block: DashboardBlockLayout): void {
  emit('resize', block.id, block.span === 2 ? 1 : 2, block.height)
}

function changeHeight(block: DashboardBlockLayout, direction: -1 | 1): void {
  const currentIndex = heights.indexOf(block.height)
  const nextIndex = Math.max(0, Math.min(heights.length - 1, currentIndex + direction))
  const height = heights[nextIndex]
  if (height) emit('resize', block.id, block.span, height)
}

function updateOcrText(event: Event): void {
  emit('update:ocrText', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <section class="dashboard-grid" :class="{ 'dashboard-grid--editing': editing }">
    <div
      v-for="block in layout"
      :key="block.id"
      class="dashboard-block"
      :class="[`dashboard-block--span-${block.span}`, `dashboard-block--height-${block.height}`]"
      @dragover.prevent
      @drop="dropOn(block.id)"
    >
      <div v-if="editing" class="layout-toolbar">
        <button
          class="layout-toolbar__drag"
          type="button"
          draggable="true"
          title="Перетащить блок"
          @dragstart="startDragging(block.id, $event)"
        >
          ⠿
        </button>
        <span>{{ block.id }}</span>
        <button type="button" title="Изменить ширину" @click="toggleSpan(block)">
          {{ block.span === 2 ? '½' : '↔' }}
        </button>
        <button type="button" title="Уменьшить высоту" @click="changeHeight(block, -1)">−</button>
        <button type="button" title="Увеличить высоту" @click="changeHeight(block, 1)">+</button>
      </div>

      <article v-if="block.id === 'capture'" class="panel">
        <header class="panel__header">
          <div>
            <span class="eyebrow">ACTIVE AREA</span>
            <h2>Область захвата</h2>
          </div>
          <button class="ghost-button" type="button" @click="$emit('selectRegion')">
            Изменить
          </button>
        </header>
        <RegionSummary :region="captureRegion" />
      </article>

      <article v-else-if="block.id === 'hotkey'" class="panel">
        <span class="eyebrow">HOTKEY</span>
        <h2>Глобальная клавиша</h2>
        <HotkeyEditor
          :model-value="settings?.hotkeys.captureRegion ?? 'Ctrl+Shift+S'"
          :saving="hotkeySaving"
          @save="$emit('saveHotkey', $event)"
        />
      </article>

      <article v-else class="panel panel--ocr">
        <header class="panel__header">
          <div>
            <span class="eyebrow">WINDOWS OCR</span>
            <h2>Распознанный текст</h2>
          </div>
          <button class="ghost-button" type="button" :disabled="!ocrText" @click="$emit('copyOcr')">
            {{ copyLabel }}
          </button>
        </header>
        <textarea
          :value="ocrText"
          class="ocr-editor"
          spellcheck="false"
          :aria-busy="ocrProcessing"
          :placeholder="
            ocrProcessing
              ? 'Распознаём текст…'
              : 'После выделения области здесь появится распознанный текст'
          "
          rows="12"
          @input="updateOcrText"
        />
        <footer class="ocr-meta">
          <span v-if="ocrProcessing" class="ocr-meta__processing">
            <i />
            OCR работает в фоне — окно уже можно использовать
          </span>
          <span v-else-if="ocrErrorMessage" class="ocr-meta__error">{{ ocrErrorMessage }}</span>
          <span v-else-if="lastOcrResult">
            {{ lastOcrResult.language }} · {{ lastOcrResult.durationMs }} ms · можно исправить перед
            отправкой в AI
          </span>
          <span v-else>OCR выполняется локально, screenshot не отправляется в AI</span>
        </footer>
      </article>
    </div>
  </section>
</template>
