<script setup lang="ts">
import MainView from '@/views/MainView.vue'
import SelectionOverlayView from '@/views/SelectionOverlayView.vue'

const view = new URLSearchParams(window.location.search).get('view')
</script>

<template>
  <SelectionOverlayView v-if="view === 'selection'" />
  <MainView v-else />
</template>
