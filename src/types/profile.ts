import type { AppSettings } from './settings'

export type DashboardBlockId = 'capture' | 'hotkey' | 'ocr' | 'reply'
export type DashboardBlockSpan = 1 | 2
export type DashboardBlockHeight = number

export interface DashboardBlockLayout {
  id: DashboardBlockId
  /**
   * Horizontal values use a 1000-unit canvas so the layout scales with the
   * application window while vertical values remain predictable pixels.
   */
  x: number
  y: number
  width: number
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
  { id: 'capture', x: 0, y: 0, width: 1000, span: 2, height: 170 },
  { id: 'hotkey', x: 0, y: 184, width: 493, span: 1, height: 280 },
  { id: 'ocr', x: 507, y: 184, width: 493, span: 1, height: 410 },
  { id: 'reply', x: 0, y: 478, width: 493, span: 1, height: 280 },
]
