export interface CloudUser {
  id: string
  telegramId: string | null
  displayName: string
  username: string | null
  avatarUrl: string | null
}

export interface CloudWorkspace {
  revision: number
  payload: Record<string, unknown>
  updatedAt: string | null
}

export interface TelegramLoginResult {
  accessToken: string
  expiresAt: string
  user: CloudUser
}
