import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings } from '@/types/settings'
import { generateAiReply } from '@/services/cloud/client'

export const useAiStore = defineStore('ai', () => {
  const reply = ref('')
  const model = ref<string | null>(null)
  const generating = ref(false)
  const errorMessage = ref<string | null>(null)

  async function generate(message: string, settings: AppSettings): Promise<void> {
    const normalizedMessage = message.trim()
    if (!normalizedMessage || generating.value) return
    generating.value = true
    errorMessage.value = null
    try {
      const result = await generateAiReply({
        message: normalizedMessage,
        language: settings.language,
        style: settings.replyStyle,
      })
      reply.value = result.reply
      model.value = result.model
    } catch (error: unknown) {
      errorMessage.value = error instanceof Error ? error.message : 'Не удалось получить AI-ответ'
    } finally {
      generating.value = false
    }
  }

  function clear(): void {
    reply.value = ''
    model.value = null
    errorMessage.value = null
  }

  return { reply, model, generating, errorMessage, generate, clear }
})
