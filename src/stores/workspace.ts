import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings } from '@/types/settings'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardBlockHeight,
  type DashboardBlockId,
  type DashboardBlockSpan,
  type TelegramIdentity,
  type UserProfile,
  type WorkspaceSnapshot,
} from '@/types/profile'

const STORAGE_KEY = 'replaypeek.workspace.v1'

interface PersistedWorkspace {
  activeProfileId: string
  profiles: UserProfile[]
}

export type ReturnTypeUseWorkspaceStore = ReturnType<typeof useWorkspaceStore>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createProfileRecord(name: string, settings: AppSettings): UserProfile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    settings: clone(settings),
    dashboardLayout: clone(DEFAULT_DASHBOARD_LAYOUT),
    telegram: null,
    createdAt: now,
    updatedAt: now,
  }
}

const legacyHeights: Record<string, number> = {
  compact: 170,
  normal: 280,
  tall: 410,
}

function normalizeLayout(value: unknown): UserProfile['dashboardLayout'] {
  const source = Array.isArray(value) ? value : []
  const result: UserProfile['dashboardLayout'] = []

  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const fallback = DEFAULT_DASHBOARD_LAYOUT.find((block) => block.id === candidate.id)
    if (!fallback || result.some((block) => block.id === fallback.id)) continue
    const legacyHeight =
      typeof candidate.height === 'string' ? legacyHeights[candidate.height] : null
    const height = typeof candidate.height === 'number' ? candidate.height : legacyHeight
    result.push({
      id: fallback.id,
      span: candidate.span === 1 ? 1 : 2,
      height: Math.round(Math.max(150, Math.min(760, height ?? fallback.height))),
    })
  }

  for (const block of DEFAULT_DASHBOARD_LAYOUT) {
    if (!result.some((item) => item.id === block.id)) result.push(clone(block))
  }
  return result
}

function normalizeSettings(value: unknown, fallback: AppSettings): AppSettings {
  if (!value || typeof value !== 'object') return clone(fallback)
  const candidate = value as Partial<AppSettings>
  return {
    ...clone(fallback),
    ...candidate,
    autoGenerateReply: candidate.autoGenerateReply === true,
    hotkeys: { ...fallback.hotkeys, ...candidate.hotkeys },
  }
}

function normalizeProfile(profile: UserProfile, fallback: AppSettings): UserProfile {
  return {
    ...profile,
    settings: normalizeSettings(profile.settings, fallback),
    dashboardLayout: normalizeLayout(profile.dashboardLayout),
    telegram: profile.telegram ?? null,
  }
}

function loadWorkspace(): PersistedWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<PersistedWorkspace>
    if (typeof candidate.activeProfileId !== 'string' || !Array.isArray(candidate.profiles)) {
      return null
    }
    if (candidate.profiles.length === 0) return null
    return candidate as PersistedWorkspace
  } catch {
    return null
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const profiles = ref<UserProfile[]>([])
  const activeProfileId = ref('')
  const layoutEditing = ref(false)

  const activeProfile = computed(
    () => profiles.value.find((profile) => profile.id === activeProfileId.value) ?? null,
  )
  const dashboardLayout = computed(
    () => activeProfile.value?.dashboardLayout ?? DEFAULT_DASHBOARD_LAYOUT,
  )

  function persist(): void {
    const value: PersistedWorkspace = {
      activeProfileId: activeProfileId.value,
      profiles: profiles.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }

  function initialize(baseSettings: AppSettings): AppSettings {
    const saved = loadWorkspace()
    if (saved && saved.profiles.some((profile) => profile.id === saved.activeProfileId)) {
      profiles.value = saved.profiles.map((profile) => normalizeProfile(profile, baseSettings))
      activeProfileId.value = saved.activeProfileId
      persist()
    } else {
      const profile = createProfileRecord('Основной', baseSettings)
      profiles.value = [profile]
      activeProfileId.value = profile.id
      persist()
    }
    return clone(activeProfile.value?.settings ?? baseSettings)
  }

  function saveActiveSettings(settings: AppSettings): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.settings = clone(settings)
    profile.updatedAt = new Date().toISOString()
    persist()
  }

  function createProfile(name: string, settings: AppSettings): string {
    const profile = createProfileRecord(
      name.trim() || `Профиль ${profiles.value.length + 1}`,
      settings,
    )
    const currentLayout = activeProfile.value?.dashboardLayout
    if (currentLayout) profile.dashboardLayout = clone(currentLayout)
    profiles.value.push(profile)
    persist()
    return profile.id
  }

  function selectProfile(profileId: string, currentSettings: AppSettings): AppSettings | null {
    const target = profiles.value.find((profile) => profile.id === profileId)
    if (!target || profileId === activeProfileId.value) return null
    saveActiveSettings(currentSettings)
    activeProfileId.value = profileId
    persist()
    return clone(target.settings)
  }

  function renameProfile(profileId: string, name: string): void {
    const profile = profiles.value.find((item) => item.id === profileId)
    const normalized = name.trim()
    if (!profile || !normalized) return
    profile.name = normalized
    profile.updatedAt = new Date().toISOString()
    persist()
  }

  function deleteProfile(profileId: string): string | null {
    if (profiles.value.length <= 1) return null
    const index = profiles.value.findIndex((profile) => profile.id === profileId)
    if (index < 0) return null
    profiles.value.splice(index, 1)
    if (activeProfileId.value === profileId) {
      activeProfileId.value = profiles.value[0]?.id ?? ''
    }
    persist()
    return activeProfileId.value
  }

  function moveBlock(sourceId: DashboardBlockId, targetId: DashboardBlockId): void {
    const layout = activeProfile.value?.dashboardLayout
    if (!layout || sourceId === targetId) return
    const sourceIndex = layout.findIndex((item) => item.id === sourceId)
    const targetIndex = layout.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = layout.splice(sourceIndex, 1)
    if (!source) return
    layout.splice(targetIndex, 0, source)
    persist()
  }

  function resizeBlock(
    blockId: DashboardBlockId,
    span: DashboardBlockSpan,
    height: DashboardBlockHeight,
  ): void {
    const block = activeProfile.value?.dashboardLayout.find((item) => item.id === blockId)
    if (!block) return
    block.span = span
    block.height = Math.round(Math.max(150, Math.min(760, height)))
    persist()
  }

  function resetLayout(): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.dashboardLayout = clone(DEFAULT_DASHBOARD_LAYOUT)
    persist()
  }

  function snapshot(): WorkspaceSnapshot {
    return clone({ activeProfileId: activeProfileId.value, profiles: profiles.value })
  }

  function restoreSnapshot(value: Record<string, unknown>): boolean {
    const candidate = value as Partial<WorkspaceSnapshot>
    if (
      typeof candidate.activeProfileId !== 'string' ||
      !Array.isArray(candidate.profiles) ||
      candidate.profiles.length === 0 ||
      !candidate.profiles.every(
        (profile) =>
          profile &&
          typeof profile.id === 'string' &&
          typeof profile.name === 'string' &&
          profile.settings,
      ) ||
      !candidate.profiles.some((profile) => profile.id === candidate.activeProfileId)
    ) {
      return false
    }
    const fallback = activeProfile.value?.settings
    if (!fallback) return false
    profiles.value = candidate.profiles.map((profile) => normalizeProfile(profile, fallback))
    activeProfileId.value = candidate.activeProfileId
    persist()
    return true
  }

  function linkTelegram(identity: TelegramIdentity): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.telegram = clone(identity)
    profile.updatedAt = new Date().toISOString()
    persist()
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    dashboardLayout,
    layoutEditing,
    initialize,
    saveActiveSettings,
    createProfile,
    selectProfile,
    renameProfile,
    deleteProfile,
    moveBlock,
    resizeBlock,
    resetLayout,
    snapshot,
    restoreSnapshot,
    linkTelegram,
  }
})
