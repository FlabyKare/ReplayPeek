<script setup lang="ts">
import MainView from '@/views/MainView.vue'
import SelectionOverlayView from '@/views/SelectionOverlayView.vue'

const view = new URLSearchParams(window.location.search).get('view')
const isSelectionView = view === 'selection'

document.documentElement.classList.toggle('selection-document', isSelectionView)
</script>

<template>
  <SelectionOverlayView v-if="isSelectionView" />
  <MainView v-else />
</template>
