<script setup lang="ts">
import type { UpdateStatus } from '@/types/update'

defineProps<{
  status: UpdateStatus
}>()

defineEmits<{
  update: []
  skip: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="update-prompt" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <article class="update-prompt__card">
        <span class="eyebrow">REPLAYPEEK UPDATE</span>
        <h2 id="update-title">Доступна версия {{ status.version }}</h2>
        <p>Можно обновиться сейчас или продолжить работу на установленной версии.</p>
        <div v-if="status.notes" class="update-prompt__notes">{{ status.notes }}</div>
        <div class="update-prompt__actions">
          <button class="ghost-button" type="button" @click="$emit('skip')">
            Остаться на текущей
          </button>
          <button
            class="primary-button update-prompt__primary"
            type="button"
            @click="$emit('update')"
          >
            Обновить сейчас
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>
