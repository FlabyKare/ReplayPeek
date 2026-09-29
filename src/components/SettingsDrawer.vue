<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UserProfile } from '@/types/profile'
import type { CloudUser } from '@/types/cloud'
import type { AppLanguage, AppSettings, ReplyStyle } from '@/types/settings'

const props = defineProps<{
  open: boolean
  profiles: UserProfile[]
  activeProfileId: string
  settings: AppSettings | null
  layoutEditing: boolean
  cloudUser: CloudUser | null
  cloudBusy: boolean
  cloudMessage: string | null
}>()

const emit = defineEmits<{
  close: []
  createProfile: [name: string]
  selectProfile: [profileId: string]
  renameProfile: [profileId: string, name: string]
  deleteProfile: [profileId: string]
  updatePreferences: [
    values: Pick<AppSettings, 'language' | 'replyStyle' | 'captureFps' | 'autoGenerateReply'>,
  ]
  toggleLayoutEditing: []
  resetLayout: []
  connectTelegram: []
  disconnectTelegram: []
  syncCloud: []
}>()

const newProfileName = ref('')
const profileNameDraft = ref('')

const activeProfile = computed(
  () => props.profiles.find((profile) => profile.id === props.activeProfileId) ?? null,
)

watch(
  () => activeProfile.value?.name,
  (name) => {
    profileNameDraft.value = name ?? ''
  },
  { immediate: true },
)

function createProfile(): void {
  emit('createProfile', newProfileName.value)
  newProfileName.value = ''
}

function renameActiveProfile(): void {
  if (!activeProfile.value) return
  emit('renameProfile', activeProfile.value.id, profileNameDraft.value)
}

function updateLanguage(event: Event): void {
  if (!props.settings) return
  emit('updatePreferences', {
    language: (event.target as HTMLSelectElement).value as AppLanguage,
    replyStyle: props.settings.replyStyle,
    captureFps: props.settings.captureFps,
    autoGenerateReply: props.settings.autoGenerateReply,
  })
}

function updateReplyStyle(event: Event): void {
  if (!props.settings) return
  emit('updatePreferences', {
    language: props.settings.language,
    replyStyle: (event.target as HTMLSelectElement).value as ReplyStyle,
    captureFps: props.settings.captureFps,
    autoGenerateReply: props.settings.autoGenerateReply,
  })
}

function updateCaptureFps(event: Event): void {
  if (!props.settings) return
  emit('updatePreferences', {
    language: props.settings.language,
    replyStyle: props.settings.replyStyle,
    captureFps: Number((event.target as HTMLInputElement).value),
    autoGenerateReply: props.settings.autoGenerateReply,
  })
}

function updateAutoGenerateReply(event: Event): void {
  if (!props.settings) return
  emit('updatePreferences', {
    language: props.settings.language,
    replyStyle: props.settings.replyStyle,
    captureFps: props.settings.captureFps,
    autoGenerateReply: (event.target as HTMLInputElement).checked,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-drawer">
      <div v-if="open" class="settings-layer" @mousedown.self="$emit('close')">
        <aside class="settings-drawer" aria-label="Настройки ReplayPeek">
          <header class="settings-drawer__header">
            <div>
              <span class="eyebrow">REPLAYPEEK</span>
              <h2>Настройки</h2>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть" @click="$emit('close')">
              ×
            </button>
          </header>

          <section class="settings-section">
            <div class="settings-section__title">
              <span>Профили</span>
              <small>Настройки и раскладка сохраняются отдельно</small>
            </div>
            <div class="profile-list">
              <div
                v-for="profile in profiles"
                :key="profile.id"
                class="profile-list__item"
                :class="{ 'profile-list__item--active': profile.id === activeProfileId }"
              >
                <button
                  class="profile-list__select"
                  type="button"
                  @click="$emit('selectProfile', profile.id)"
                >
                  <span>{{ profile.name.slice(0, 1).toUpperCase() }}</span>
                  <span class="profile-list__copy">
                    <strong>{{ profile.name }}</strong>
                    <small>{{
                      profile.telegram ? `@${profile.telegram.username}` : 'Локальный профиль'
                    }}</small>
                  </span>
                </button>
                <button
                  v-if="profile.id !== activeProfileId"
                  class="profile-list__delete"
                  type="button"
                  title="Удалить профиль"
                  @click.stop="$emit('deleteProfile', profile.id)"
                >
                  ×
                </button>
              </div>
            </div>
            <form class="profile-create" @submit.prevent="createProfile">
              <input
                v-model="newProfileName"
                type="text"
                maxlength="32"
                placeholder="Новый профиль"
              />
              <button class="ghost-button" type="submit">Добавить</button>
            </form>
            <form v-if="activeProfile" class="profile-create" @submit.prevent="renameActiveProfile">
              <input
                v-model="profileNameDraft"
                type="text"
                maxlength="32"
                aria-label="Имя профиля"
              />
              <button class="ghost-button" type="submit">Переименовать</button>
            </form>
          </section>

          <section class="settings-section telegram-card">
            <div class="telegram-card__icon">➤</div>
            <div>
              <strong>{{ cloudUser ? cloudUser.displayName : 'Telegram Sync' }}</strong>
              <p>
                {{
                  cloudUser
                    ? cloudUser.username
                      ? `@${cloudUser.username} · профиль синхронизируется`
                      : 'Профиль подключён и синхронизируется'
                    : 'Вход или регистрация через Telegram для синхронизации профилей между устройствами.'
                }}
              </p>
              <button
                v-if="!cloudUser"
                class="telegram-button"
                type="button"
                :disabled="cloudBusy"
                @click="$emit('connectTelegram')"
              >
                {{ cloudBusy ? 'Ожидаем Telegram…' : 'Войти через Telegram' }}
              </button>
              <div v-else class="telegram-card__actions">
                <button
                  class="telegram-button"
                  type="button"
                  :disabled="cloudBusy"
                  @click="$emit('syncCloud')"
                >
                  Синхронизировать
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="cloudBusy"
                  @click="$emit('disconnectTelegram')"
                >
                  Выйти
                </button>
              </div>
              <small v-if="cloudMessage">{{ cloudMessage }}</small>
            </div>
          </section>

          <section v-if="settings" class="settings-section">
            <div class="settings-section__title">
              <span>Основные</span>
              <small>Применяются к активному профилю</small>
            </div>
            <label class="settings-field">
              <span>Язык OCR</span>
              <select :value="settings.language" @change="updateLanguage">
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label class="settings-field">
              <span>Стиль ответа</span>
              <select :value="settings.replyStyle" @change="updateReplyStyle">
                <option value="funny">Весёлый</option>
                <option value="sarcastic">Саркастичный</option>
                <option value="calm">Спокойный</option>
                <option value="smart">Умный</option>
              </select>
            </label>
            <label class="settings-toggle">
              <input
                type="checkbox"
                :checked="settings.autoGenerateReply"
                @change="updateAutoGenerateReply"
              />
              <span>
                <strong>Генерировать автоматически</strong>
                <small>После каждого успешного OCR. Если выключено — только по кнопке.</small>
              </span>
            </label>
            <label class="settings-field">
              <span>Частота мониторинга: {{ settings.captureFps }} FPS</span>
              <input
                type="range"
                min="1"
                max="10"
                :value="settings.captureFps"
                @change="updateCaptureFps"
              />
            </label>
          </section>

          <section class="settings-section">
            <div class="settings-section__title">
              <span>Раскладка</span>
              <small>Положение и размер блоков активного профиля</small>
            </div>
            <button class="layout-edit-button" type="button" @click="$emit('toggleLayoutEditing')">
              {{ layoutEditing ? 'Завершить редактирование' : 'Редактировать блоки' }}
            </button>
            <button class="ghost-button" type="button" @click="$emit('resetLayout')">
              Сбросить раскладку
            </button>
          </section>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
