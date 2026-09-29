import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { CloudUser } from '@/types/cloud'
import type { WorkspaceSnapshot } from '@/types/profile'
import {
  clearCloudSession,
  getCloudUser,
  getCloudWorkspace,
  hasCloudSession,
  loginWithTelegram,
  logoutCloud,
  putCloudWorkspace,
} from '@/services/cloud/client'
import type { ReturnTypeUseWorkspaceStore } from './workspace'

export const useCloudStore = defineStore('cloud', () => {
  const user = ref<CloudUser | null>(null)
  const revision = ref<number | null>(null)
  const busy = ref(false)
  const message = ref<string | null>(null)
  let uploadTimer: number | null = null

  async function synchronize(workspace: ReturnTypeUseWorkspaceStore): Promise<boolean> {
    const remote = await getCloudWorkspace()
    revision.value = remote.revision
    if (remote.revision === 0 && Object.keys(remote.payload).length === 0) {
      const saved = await putCloudWorkspace(remote.revision, workspace.snapshot())
      revision.value = saved.revision
      message.value = 'Локальные настройки сохранены в облаке'
      return false
    }
    const restored = workspace.restoreSnapshot(remote.payload)
    message.value = restored
      ? 'Настройки загружены из облака'
      : 'Облачные настройки имеют неподдерживаемый формат'
    return restored
  }

  async function initialize(workspace: ReturnTypeUseWorkspaceStore): Promise<boolean> {
    if (!hasCloudSession()) return false
    busy.value = true
    try {
      user.value = await getCloudUser()
      return await synchronize(workspace)
    } catch {
      clearCloudSession()
      user.value = null
      revision.value = null
      return false
    } finally {
      busy.value = false
    }
  }

  async function connect(workspace: ReturnTypeUseWorkspaceStore): Promise<boolean> {
    busy.value = true
    message.value = 'Завершите вход в открывшемся браузере…'
    try {
      const result = await loginWithTelegram()
      user.value = result.user
      workspace.linkTelegram({
        id: result.user.telegramId ?? result.user.id,
        displayName: result.user.displayName,
        username: result.user.username,
        avatarUrl: result.user.avatarUrl,
      })
      return await synchronize(workspace)
    } catch (error: unknown) {
      message.value = error instanceof Error ? error.message : 'Не удалось войти через Telegram'
      return false
    } finally {
      busy.value = false
    }
  }

  function scheduleUpload(snapshot: WorkspaceSnapshot): void {
    if (!user.value || revision.value === null) return
    if (uploadTimer !== null) window.clearTimeout(uploadTimer)
    uploadTimer = window.setTimeout(() => {
      uploadTimer = null
      void upload(snapshot)
    }, 900)
  }

  async function upload(snapshot: WorkspaceSnapshot): Promise<void> {
    if (revision.value === null) return
    try {
      const saved = await putCloudWorkspace(revision.value, snapshot)
      revision.value = saved.revision
      message.value = 'Синхронизировано'
    } catch (error: unknown) {
      message.value = error instanceof Error ? error.message : 'Ошибка синхронизации'
    }
  }

  async function disconnect(): Promise<void> {
    busy.value = true
    try {
      await logoutCloud()
    } finally {
      user.value = null
      revision.value = null
      message.value = 'Telegram отключён'
      busy.value = false
    }
  }

  return { user, busy, message, initialize, connect, scheduleUpload, upload, disconnect }
})
