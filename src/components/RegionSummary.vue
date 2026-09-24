<script setup lang="ts">
import type { CaptureRegion } from '@/types/capture'

defineProps<{ region: CaptureRegion | null }>()
</script>

<template>
  <div class="region-summary" :class="{ 'region-summary--empty': !region }">
    <span class="region-summary__dot" />
    <template v-if="region">
      <strong>{{ region.width }} × {{ region.height }}</strong>
      <span>x {{ region.x }}, y {{ region.y }}</span>
      <span v-if="region.monitorId">{{ region.monitorId }}</span>
    </template>
    <span v-else>Область ещё не выбрана</span>
  </div>
</template>
