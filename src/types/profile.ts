import type { AppSettings } from './settings'

export type DashboardBlockId = 'capture' | 'hotkey' | 'ocr'
export type DashboardBlockSpan = 1 | 2
export type DashboardBlockHeight = 'compact' | 'normal' | 'tall'

export interface DashboardBlockLayout {
  id: DashboardBlockId
  span: DashboardBlockSpan
  height: DashboardBlockHeight
}

export interface TelegramIdentity {
  id: string
  displayName: string
  username: string | null
  avatarUrl: string | null
}

export interface UserProfile {
  id: string
  name: string
  settings: AppSettings
  dashboardLayout: DashboardBlockLayout[]
  telegram: TelegramIdentity | null
  createdAt: string
  updatedAt: string
}

export interface WorkspaceSnapshot {
  activeProfileId: string
  profiles: UserProfile[]
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardBlockLayout[] = [
  { id: 'capture', span: 2, height: 'compact' },
  { id: 'hotkey', span: 1, height: 'normal' },
  { id: 'ocr', span: 2, height: 'tall' },
]
