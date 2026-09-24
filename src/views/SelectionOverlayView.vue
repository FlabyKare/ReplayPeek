<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { cancelRegionSelection, completeRegionSelection } from '@/services/tauri/capture'
import { rectangleFromPoints, type Point } from '@/utils/geometry'

const start = ref<Point | null>(null)
const current = ref<Point | null>(null)
const submitting = ref(false)

const rectangle = computed(() => {
  if (!start.value || !current.value) return null
  return rectangleFromPoints(start.value, current.value)
})

const selectionStyle = computed(() => {
  const rect = rectangle.value
  if (!rect) return undefined
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})

function pointerPosition(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY }
}

function beginSelection(event: PointerEvent): void {
  if (submitting.value || event.button !== 0) return
  const point = pointerPosition(event)
  start.value = point
  current.value = point
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveSelection(event: PointerEvent): void {
  if (!start.value || submitting.value) return
  current.value = pointerPosition(event)
}

async function finishSelection(event: PointerEvent): Promise<void> {
  if (!start.value || submitting.value) return
  current.value = pointerPosition(event)
  const rect = rectangle.value
  if (!rect || rect.width < 4 || rect.height < 4) {
    start.value = null
    current.value = null
    return
  }

  submitting.value = true
  try {
    await completeRegionSelection(rect)
  } finally {
    submitting.value = false
    start.value = null
    current.value = null
  }
}

function endSelection(event: PointerEvent): void {
  void finishSelection(event)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') void cancelRegionSelection()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <main
    class="selection-overlay"
    @pointerdown="beginSelection"
    @pointermove="moveSelection"
    @pointerup="endSelection"
  >
    <div class="selection-overlay__hint">
      <strong>{{ submitting ? 'Захватываем…' : 'Выберите область' }}</strong>
      <span>Зажмите и протяните мышь · Esc для отмены</span>
    </div>

    <div v-if="rectangle" class="selection" :style="selectionStyle">
      <span class="selection__size">
        {{ Math.round(rectangle.width * window.devicePixelRatio) }} ×
        {{ Math.round(rectangle.height * window.devicePixelRatio) }} px
      </span>
    </div>
  </main>
</template>
