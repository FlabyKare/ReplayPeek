<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { cancelRegionSelection, completeRegionSelection } from '@/services/tauri/capture'
import { rectangleFromPoints, type Point } from '@/utils/geometry'

const start = ref<Point | null>(null)
const current = ref<Point | null>(null)
const submitting = ref(false)
const selectionElement = ref<HTMLDivElement | null>(null)
const selectionSizeElement = ref<HTMLSpanElement | null>(null)

const rectangle = computed(() => {
  if (!start.value || !current.value) return null
  return rectangleFromPoints(start.value, current.value)
})

function renderSelectionFrame(): void {
  const rect = rectangle.value
  const element = selectionElement.value
  if (!rect || !element || rect.width === 0 || rect.height === 0) return

  // Pre-created hidden WebView2 windows can defer a Vue render cycle after show().
  // Update the capture feedback synchronously so the frame always follows the cursor.
  element.style.display = 'block'
  element.style.left = `${rect.x}px`
  element.style.top = `${rect.y}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
  if (selectionSizeElement.value) {
    selectionSizeElement.value.textContent = `${Math.round(rect.width * window.devicePixelRatio)} × ${Math.round(rect.height * window.devicePixelRatio)} px`
  }
}

function hideSelectionFrame(): void {
  if (selectionElement.value) selectionElement.value.style.display = 'none'
}

function mousePosition(event: MouseEvent): Point {
  return { x: event.clientX, y: event.clientY }
}

function beginSelection(event: MouseEvent): void {
  if (submitting.value || event.button !== 0) return
  const point = mousePosition(event)
  start.value = point
  current.value = point
  hideSelectionFrame()
}

function moveSelection(event: MouseEvent): void {
  if (!start.value || submitting.value) return
  current.value = mousePosition(event)
  renderSelectionFrame()
}

async function finishSelection(event: MouseEvent): Promise<void> {
  if (!start.value || submitting.value) return
  current.value = mousePosition(event)
  renderSelectionFrame()
  const rect = rectangle.value
  if (!rect || rect.width < 4 || rect.height < 4) {
    start.value = null
    current.value = null
    hideSelectionFrame()
    return
  }

  submitting.value = true
  try {
    await completeRegionSelection(rect)
  } finally {
    submitting.value = false
    start.value = null
    current.value = null
    hideSelectionFrame()
  }
}

function endSelection(event: MouseEvent): void {
  void finishSelection(event)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') void cancelRegionSelection()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousemove', moveSelection)
  window.addEventListener('mouseup', endSelection)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousemove', moveSelection)
  window.removeEventListener('mouseup', endSelection)
})
</script>

<template>
  <main class="selection-overlay" @mousedown="beginSelection">
    <div class="selection-overlay__hint">
      <strong>{{ submitting ? 'Захватываем…' : 'Выберите область' }}</strong>
      <span>Зажмите и протяните мышь · Esc для отмены</span>
    </div>

    <div ref="selectionElement" class="selection">
      <i class="selection__corner selection__corner--top-left" />
      <i class="selection__corner selection__corner--top-right" />
      <i class="selection__corner selection__corner--bottom-left" />
      <i class="selection__corner selection__corner--bottom-right" />
      <span ref="selectionSizeElement" class="selection__size" />
    </div>
  </main>
</template>
