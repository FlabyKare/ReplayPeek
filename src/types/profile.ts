import type { AppSettings } from './settings'

export type DashboardBlockId = 'capture' | 'hotkey' | 'ocr' | 'reply'
export type DashboardBlockSpan = 1 | 2
export type DashboardBlockHeight = number

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
  { id: 'capture', span: 2, height: 170 },
  { id: 'hotkey', span: 1, height: 280 },
  { id: 'ocr', span: 2, height: 410 },
  { id: 'reply', span: 1, height: 280 },
]
