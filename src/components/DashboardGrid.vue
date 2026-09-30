<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import RegionSummary from '@/components/RegionSummary.vue'
import HotkeyEditor from '@/components/HotkeyEditor.vue'
import type { CaptureRegion, OcrResult } from '@/types/capture'
import type { DashboardBlockId, DashboardBlockLayout } from '@/types/profile'
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
  updateLayout: [layout: DashboardBlockLayout[]]
  selectRegion: []
  saveHotkey: [hotkey: string]
  copyOcr: []
  generateReply: []
  copyReply: []
  'update:ocrText': [value: string]
}>()

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface LayoutSession {
  blockId: DashboardBlockId
  pointerId: number
  target: HTMLElement
  mode: 'move' | 'resize'
  direction?: ResizeDirection
  canvasWidth: number
  startClientX: number
  startClientY: number
  latestClientX: number
  latestClientY: number
  startLeft: number
  startTop: number
  startWidth: number
  startHeight: number
  animationFrame: number | null
}

const activeBlock = ref<DashboardBlockId | null>(null)
const interactionMode = ref<'move' | 'resize' | null>(null)
const draftLayouts = ref<Partial<Record<DashboardBlockId, DashboardBlockLayout>>>({})
let layoutSession: LayoutSession | null = null

const resizeDirections: ResizeDirection[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

const canvasHeight = computed(() => {
  const bottom = props.layout.reduce((maximum, block) => {
    const layout = draftLayouts.value[block.id] ?? block
    return Math.max(maximum, layout.y + layout.height)
  }, 0)
  return Math.max(170, bottom)
})

function minimumHeight(blockId: DashboardBlockId): number {
  if (blockId === 'ocr') return 320
  if (blockId === 'hotkey' || blockId === 'reply') return 220
  return 160
}

function minimumWidth(blockId: DashboardBlockId): number {
  if (blockId === 'ocr') return 360
  if (blockId === 'capture') return 380
  return 300
}

function displayedLayout(block: DashboardBlockLayout): DashboardBlockLayout {
  return draftLayouts.value[block.id] ?? block
}

function blockStyle(block: DashboardBlockLayout): Record<string, string> {
  const layout = displayedLayout(block)
  return {
    left: `${layout.x / 10}%`,
    top: `${layout.y}px`,
    width: `${layout.width / 10}%`,
    height: `${layout.height}px`,
  }
}

function beginInteraction(
  block: DashboardBlockLayout,
  mode: 'move' | 'resize',
  event: PointerEvent,
  direction?: ResizeDirection,
): void {
  if (!props.editing || layoutSession) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as HTMLElement
  const canvas = target.closest<HTMLElement>('.dashboard-grid')
  if (!canvas) return
  const canvasRect = canvas.getBoundingClientRect()
  const layout = displayedLayout(block)
  layoutSession = {
    blockId: block.id,
    pointerId: event.pointerId,
    target,
    mode,
    direction,
    canvasWidth: canvasRect.width,
    startClientX: event.clientX,
    startClientY: event.clientY,
    latestClientX: event.clientX,
    latestClientY: event.clientY,
    startLeft: (layout.x / 1000) * canvasRect.width,
    startTop: layout.y,
    startWidth: (layout.width / 1000) * canvasRect.width,
    startHeight: layout.height,
    animationFrame: null,
  }
  activeBlock.value = block.id
  interactionMode.value = mode
  target.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('layout-interacting')
}

function startMoving(block: DashboardBlockLayout, event: PointerEvent): void {
  beginInteraction(block, 'move', event)
}

function startResizing(
  block: DashboardBlockLayout,
  direction: ResizeDirection,
  event: PointerEvent,
): void {
  beginInteraction(block, 'resize', event, direction)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function blocksOverlap(first: DashboardBlockLayout, second: DashboardBlockLayout): boolean {
  const horizontalGap = 8
  const verticalGap = 12
  return (
    first.x < second.x + second.width + horizontalGap &&
    first.x + first.width + horizontalGap > second.x &&
    first.y < second.y + second.height + verticalGap &&
    first.y + first.height + verticalGap > second.y
  )
}

function resolveCollisions(activeLayout: DashboardBlockLayout): void {
  const layouts = props.layout.map((block) =>
    block.id === activeLayout.id ? activeLayout : { ...block },
  )
  const queue: DashboardBlockId[] = [activeLayout.id]
  let passes = 0

  while (queue.length > 0 && passes < layouts.length * layouts.length) {
    passes += 1
    const anchorId = queue.shift()
    const anchor = layouts.find((block) => block.id === anchorId)
    if (!anchor) continue
    for (const candidate of layouts) {
      if (candidate.id === anchor.id || candidate.id === activeLayout.id) continue
      if (!blocksOverlap(anchor, candidate)) continue
      candidate.y = anchor.y + anchor.height + 14
      queue.push(candidate.id)
    }
  }

  const drafts: Partial<Record<DashboardBlockId, DashboardBlockLayout>> = {}
  for (const layout of layouts) drafts[layout.id] = layout
  draftLayouts.value = drafts
}

function applyInteractionFrame(): void {
  const session = layoutSession
  if (!session) return
  session.animationFrame = null
  const deltaX = session.latestClientX - session.startClientX
  const deltaY = session.latestClientY - session.startClientY
  let left = session.startLeft
  let top = session.startTop
  let width = session.startWidth
  let height = session.startHeight

  if (session.mode === 'move') {
    left = clamp(session.startLeft + deltaX, 0, session.canvasWidth - session.startWidth)
    top = Math.max(0, session.startTop + deltaY)
  } else {
    const direction = session.direction ?? 'se'
    const minimumBlockWidth = Math.min(
      minimumWidth(session.blockId),
      Math.max(180, session.canvasWidth),
    )
    const minimumBlockHeight = minimumHeight(session.blockId)

    if (direction.includes('e')) {
      width = clamp(session.startWidth + deltaX, minimumBlockWidth, session.canvasWidth - left)
    }
    if (direction.includes('s')) {
      height = clamp(session.startHeight + deltaY, minimumBlockHeight, 1200)
    }
    if (direction.includes('w')) {
      const right = session.startLeft + session.startWidth
      left = clamp(session.startLeft + deltaX, 0, right - minimumBlockWidth)
      width = right - left
    }
    if (direction.includes('n')) {
      const bottom = session.startTop + session.startHeight
      top = clamp(session.startTop + deltaY, 0, bottom - minimumBlockHeight)
      height = bottom - top
    }
  }

  const normalizedWidth = Math.round((width / session.canvasWidth) * 1000)
  const normalizedX = Math.round((left / session.canvasWidth) * 1000)
  resolveCollisions({
    id: session.blockId,
    x: normalizedX,
    y: Math.round(top),
    width: normalizedWidth,
    span: normalizedWidth >= 750 ? 2 : 1,
    height: Math.round(height),
  })
}

function updateInteraction(event: PointerEvent): void {
  const session = layoutSession
  if (!session || session.pointerId !== event.pointerId) return
  event.preventDefault()
  session.latestClientX = event.clientX
  session.latestClientY = event.clientY
  if (session.animationFrame === null) {
    session.animationFrame = requestAnimationFrame(applyInteractionFrame)
  }
}

function finishInteraction(event: PointerEvent): void {
  const session = layoutSession
  if (!session || session.pointerId !== event.pointerId) return
  session.latestClientX = event.clientX
  session.latestClientY = event.clientY
  if (session.animationFrame !== null) cancelAnimationFrame(session.animationFrame)
  applyInteractionFrame()
  const finalLayout = props.layout.map((block) => draftLayouts.value[block.id] ?? block)
  emit('updateLayout', finalLayout)
  if (session.target.hasPointerCapture(event.pointerId)) {
    session.target.releasePointerCapture(event.pointerId)
  }
  draftLayouts.value = {}
  layoutSession = null
  activeBlock.value = null
  interactionMode.value = null
  document.documentElement.classList.remove('layout-interacting')
}

function cancelInteraction(event?: PointerEvent): void {
  const session = layoutSession
  if (!session || (event && session.pointerId !== event.pointerId)) return
  if (session.animationFrame !== null) cancelAnimationFrame(session.animationFrame)
  if (event && session.target.hasPointerCapture(event.pointerId)) {
    session.target.releasePointerCapture(event.pointerId)
  }
  draftLayouts.value = {}
  layoutSession = null
  activeBlock.value = null
  interactionMode.value = null
  document.documentElement.classList.remove('layout-interacting')
}

function updateOcrText(event: Event): void {
  emit('update:ocrText', (event.target as HTMLTextAreaElement).value)
}

onBeforeUnmount(() => cancelInteraction())
</script>

<template>
  <section
    class="dashboard-grid"
    :class="{ 'dashboard-grid--editing': editing }"
    :style="{ height: `${canvasHeight}px` }"
  >
    <div
      v-for="block in layout"
      :key="block.id"
      class="dashboard-block"
      :class="[
        {
          'dashboard-block--interacting': activeBlock === block.id,
          'dashboard-block--moving': activeBlock === block.id && interactionMode === 'move',
          'dashboard-block--resizing': activeBlock === block.id && interactionMode === 'resize',
        },
      ]"
      :style="blockStyle(block)"
      :data-dashboard-block="block.id"
    >
      <div v-if="editing" class="layout-toolbar">
        <button
          class="layout-toolbar__drag"
          type="button"
          title="Перетащить блок"
          @pointerdown="startMoving(block, $event)"
          @pointermove="updateInteraction"
          @pointerup="finishInteraction"
          @pointercancel="cancelInteraction"
        >
          ⠿
        </button>
        <span>{{ block.id }}</span>
        <output>
          {{ Math.round(displayedLayout(block).width / 10) }}% ×
          {{ displayedLayout(block).height }}
        </output>
      </div>

      <button
        v-for="direction in editing ? resizeDirections : []"
        :key="direction"
        class="layout-resize-handle"
        :class="`layout-resize-handle--${direction}`"
        type="button"
        aria-label="Изменить размер блока"
        :title="`Изменить размер: ${direction}`"
        @pointerdown="startResizing(block, direction, $event)"
        @pointermove="updateInteraction"
        @pointerup="finishInteraction"
        @pointercancel="cancelInteraction"
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
