import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings } from '@/types/settings'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardBlockLayout,
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
  const parsed: Array<
    Omit<DashboardBlockLayout, 'x' | 'y' | 'width'> &
      Partial<Pick<DashboardBlockLayout, 'x' | 'y' | 'width'>>
  > = []

  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const fallback = DEFAULT_DASHBOARD_LAYOUT.find((block) => block.id === candidate.id)
    if (!fallback || parsed.some((block) => block.id === fallback.id)) continue
    const legacyHeight =
      typeof candidate.height === 'string' ? legacyHeights[candidate.height] : null
    const height = typeof candidate.height === 'number' ? candidate.height : legacyHeight
    parsed.push({
      id: fallback.id,
      span: candidate.span === 1 ? 1 : 2,
      height: Math.round(Math.max(150, Math.min(1200, height ?? fallback.height))),
      x: typeof candidate.x === 'number' ? candidate.x : undefined,
      y: typeof candidate.y === 'number' ? candidate.y : undefined,
      width: typeof candidate.width === 'number' ? candidate.width : undefined,
    })
  }

  for (const block of DEFAULT_DASHBOARD_LAYOUT) {
    if (!parsed.some((item) => item.id === block.id)) parsed.push(clone(block))
  }

  const hasCompleteGeometry = parsed.every(
    (block) => Number.isFinite(block.x) && Number.isFinite(block.y) && Number.isFinite(block.width),
  )
  if (hasCompleteGeometry) {
    return parsed.map((block) => {
      const width = Math.round(Math.max(180, Math.min(1000, block.width ?? 1000)))
      return {
        id: block.id,
        x: Math.round(Math.max(0, Math.min(1000 - width, block.x ?? 0))),
        y: Math.round(Math.max(0, Math.min(5000, block.y ?? 0))),
        width,
        span: width >= 750 ? 2 : 1,
        height: Math.round(Math.max(150, Math.min(1200, block.height))),
      }
    })
  }

  // Migrate the former two-column flow layout without resetting users' order
  // or their already selected block heights.
  const result: DashboardBlockLayout[] = []
  let rowY = 0
  let pendingHalf: { index: number; height: number } | null = null
  for (const block of parsed) {
    if (block.span === 2) {
      if (pendingHalf) {
        rowY += pendingHalf.height + 14
        pendingHalf = null
      }
      result.push({ ...block, x: 0, y: rowY, width: 1000 })
      rowY += block.height + 14
      continue
    }
    if (!pendingHalf) {
      result.push({ ...block, x: 0, y: rowY, width: 493 })
      pendingHalf = { index: result.length - 1, height: block.height }
      continue
    }
    result.push({ ...block, x: 507, y: rowY, width: 493 })
    rowY += Math.max(pendingHalf.height, block.height) + 14
    pendingHalf = null
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

  function updateDashboardLayout(layout: DashboardBlockLayout[]): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.dashboardLayout = normalizeLayout(layout)
    profile.updatedAt = new Date().toISOString()
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
    updateDashboardLayout,
    resetLayout,
    snapshot,
    restoreSnapshot,
    linkTelegram,
  }
})
