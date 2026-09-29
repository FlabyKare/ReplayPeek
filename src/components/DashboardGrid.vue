<script setup lang="ts">
import { ref } from 'vue'
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
  aiReply: string
  aiGenerating: boolean
  aiErrorMessage: string | null
  aiModel: string | null
  replyCopyLabel: string
}>()

const emit = defineEmits<{
  move: [sourceId: DashboardBlockId, targetId: DashboardBlockId]
  resize: [blockId: DashboardBlockId, span: DashboardBlockSpan, height: DashboardBlockHeight]
  selectRegion: []
  saveHotkey: [hotkey: string]
  copyOcr: []
  generateReply: []
  copyReply: []
  'update:ocrText': [value: string]
}>()

const draggedBlock = ref<DashboardBlockId | null>(null)
const dragTarget = ref<DashboardBlockId | null>(null)
const resizingBlock = ref<DashboardBlockId | null>(null)

interface ResizeSession {
  blockId: DashboardBlockId
  pointerId: number
  startX: number
  startY: number
  startHeight: number
  startWidth: number
  columnWidth: number
  lastSpan: DashboardBlockSpan
  lastHeight: number
}

let resizeSession: ResizeSession | null = null

function startDragging(blockId: DashboardBlockId, event: PointerEvent): void {
  if (!props.editing) return
  event.preventDefault()
  draggedBlock.value = blockId
  dragTarget.value = null
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function dragBlock(event: PointerEvent): void {
  if (!draggedBlock.value) return
  const target = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-dashboard-block]')
  const targetId = target?.dataset.dashboardBlock as DashboardBlockId | undefined
  if (!targetId || targetId === draggedBlock.value || targetId === dragTarget.value) return
  dragTarget.value = targetId
  emit('move', draggedBlock.value, targetId)
}

function stopDragging(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  draggedBlock.value = null
  dragTarget.value = null
}

function minimumHeight(blockId: DashboardBlockId): number {
  if (blockId === 'ocr') return 320
  if (blockId === 'hotkey' || blockId === 'reply') return 220
  return 160
}

function startResizing(block: DashboardBlockLayout, event: PointerEvent): void {
  if (!props.editing) return
  event.preventDefault()
  event.stopPropagation()
  const handle = event.currentTarget as HTMLElement
  const blockElement = handle.closest<HTMLElement>('[data-dashboard-block]')
  const gridElement = handle.closest<HTMLElement>('.dashboard-grid')
  if (!blockElement || !gridElement) return
  const blockRect = blockElement.getBoundingClientRect()
  const gridRect = gridElement.getBoundingClientRect()
  resizeSession = {
    blockId: block.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startHeight: block.height,
    startWidth: blockRect.width,
    columnWidth: (gridRect.width - 14) / 2,
    lastSpan: block.span,
    lastHeight: block.height,
  }
  resizingBlock.value = block.id
  handle.setPointerCapture(event.pointerId)
}

function resizeBlock(event: PointerEvent): void {
  const session = resizeSession
  if (!session || session.pointerId !== event.pointerId) return
  const desiredWidth = session.startWidth + event.clientX - session.startX
  const span: DashboardBlockSpan = desiredWidth > session.columnWidth * 1.45 ? 2 : 1
  const height =
    Math.round(
      Math.max(
        minimumHeight(session.blockId),
        Math.min(760, session.startHeight + event.clientY - session.startY),
      ) / 8,
    ) * 8
  if (span === session.lastSpan && height === session.lastHeight) return
  session.lastSpan = span
  session.lastHeight = height
  emit('resize', session.blockId, span, height)
}

function stopResizing(event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  resizeSession = null
  resizingBlock.value = null
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
      :class="[
        `dashboard-block--span-${block.span}`,
        {
          'dashboard-block--dragging': draggedBlock === block.id,
          'dashboard-block--drop-target': dragTarget === block.id,
          'dashboard-block--resizing': resizingBlock === block.id,
        },
      ]"
      :style="{ minHeight: `${block.height}px` }"
      :data-dashboard-block="block.id"
    >
      <div v-if="editing" class="layout-toolbar">
        <button
          class="layout-toolbar__drag"
          type="button"
          title="Перетащить блок"
          @pointerdown="startDragging(block.id, $event)"
          @pointermove="dragBlock"
          @pointerup="stopDragging"
          @pointercancel="stopDragging"
        >
          ⠿
        </button>
        <span>{{ block.id }}</span>
      </div>

      <button
        v-if="editing"
        class="layout-resize-handle"
        type="button"
        aria-label="Изменить размер блока"
        title="Потяните, чтобы изменить размер"
        @pointerdown="startResizing(block, $event)"
        @pointermove="resizeBlock"
        @pointerup="stopResizing"
        @pointercancel="stopResizing"
      />

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

      <article v-else-if="block.id === 'ocr'" class="panel panel--ocr">
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

      <article v-else class="panel panel--reply">
        <header class="panel__header">
          <div>
            <span class="eyebrow">AI REPLY</span>
            <h2>Предложенный ответ</h2>
          </div>
          <button
            class="ghost-button"
            type="button"
            :disabled="!aiReply"
            @click="$emit('copyReply')"
          >
            {{ replyCopyLabel }}
          </button>
        </header>
        <div class="ai-reply" :class="{ 'ai-reply--empty': !aiReply }" aria-live="polite">
          {{
            aiGenerating
              ? 'Генерируем короткий ответ…'
              : aiReply || 'Распознайте текст и нажмите «Сгенерировать ответ»'
          }}
        </div>
        <button
          class="ai-generate-button"
          type="button"
          :disabled="!ocrText || aiGenerating"
          @click="$emit('generateReply')"
        >
          {{
            aiGenerating ? 'Генерация…' : aiReply ? 'Сгенерировать заново' : 'Сгенерировать ответ'
          }}
        </button>
        <footer class="ocr-meta">
          <span v-if="aiErrorMessage" class="ocr-meta__error">{{ aiErrorMessage }}</span>
          <span v-else-if="aiModel">{{ aiModel }} · в AI отправлен только OCR-текст</span>
          <span v-else>Screenshot остаётся на устройстве</span>
        </footer>
      </article>
    </div>
  </section>
</template>
