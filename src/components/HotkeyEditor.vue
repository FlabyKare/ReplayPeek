<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { formatHotkeyLabel, hotkeyFromKeyboardEvent, isModifierKey } from '@/utils/hotkey'

const props = defineProps<{
  modelValue: string
  saving: boolean
}>()

const emit = defineEmits<{
  save: [hotkey: string]
}>()

const recorder = ref<HTMLButtonElement | null>(null)
const draft = ref(props.modelValue)
const recording = ref(false)
const validationMessage = ref<string | null>(null)

watch(
  () => props.modelValue,
  (value) => {
    if (!recording.value) draft.value = value
  },
)

function startRecording(): void {
  recording.value = true
  validationMessage.value = null
  window.addEventListener('keydown', record, true)
  void nextTick(() => recorder.value?.focus())
}

function stopRecording(): void {
  recording.value = false
  window.removeEventListener('keydown', record, true)
}

function record(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    stopRecording()
    validationMessage.value = null
    return
  }
  if (isModifierKey(event.key)) return

  const hotkey = hotkeyFromKeyboardEvent(event)
  if (!hotkey) {
    validationMessage.value = 'Используйте Ctrl, Alt или Shift вместе с клавишей'
    return
  }

  draft.value = hotkey
  stopRecording()
  validationMessage.value = null
  emit('save', hotkey)
}

onBeforeUnmount(stopRecording)
</script>

<template>
  <div class="hotkey-editor">
    <button
      ref="recorder"
      class="hotkey-editor__recorder"
      :class="{ 'hotkey-editor__recorder--recording': recording }"
      type="button"
      :disabled="saving"
      @click="startRecording"
      @keydown="record"
    >
      <span>Capture region</span>
      <kbd>{{ recording ? 'Нажмите сочетание…' : formatHotkeyLabel(draft) }}</kbd>
    </button>
    <div class="hotkey-editor__footer">
      <span :class="{ 'hotkey-editor__error': validationMessage }">
        {{
          validationMessage ??
          (saving
            ? 'Регистрируем новую комбинацию…'
            : 'Нажмите поле и введите комбинацию — она сохранится автоматически')
        }}
      </span>
    </div>
  </div>
</template>
