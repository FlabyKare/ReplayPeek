import { openUrl } from '@tauri-apps/plugin-opener'
import type { CloudUser, CloudWorkspace, TelegramLoginResult } from '@/types/cloud'
import type { WorkspaceSnapshot } from '@/types/profile'
import type { GenerateReplyRequest, GenerateReplyResponse } from '@/types/ai'

const TOKEN_KEY = 'replaypeek.cloud.token.v1'
const apiUrl = import.meta.env.VITE_SYNC_API_URL?.replace(/\/$/, '') ?? ''

interface AuthAttempt {
  attemptId: string
  attemptSecret: string
  authorizeUrl: string
  expiresAt: string
}

interface PollPending {
  status: 'pending'
}

interface PollComplete extends TelegramLoginResult {
  status: 'complete'
}

async function responseJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json()
  return body as T
}

function backendUrl(path: string): string {
  if (!apiUrl) throw new Error('Адрес ReplayPeek Sync API не настроен в сборке')
  return `${apiUrl}${path}`
}

async function authorizedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) throw new Error('Войдите через Telegram')
  return fetch(backendUrl(path), {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  })
}

export function hasCloudSession(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}

export function clearCloudSession(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function loginWithTelegram(): Promise<TelegramLoginResult> {
  const startResponse = await fetch(backendUrl('/v1/auth/desktop/start'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceName: 'ReplayPeek Windows' }),
  })
  if (startResponse.status === 503) {
    throw new Error('Telegram Login ещё не активирован на сервере')
  }
  if (!startResponse.ok) throw new Error(`Сервер авторизации ответил ${startResponse.status}`)

  const attempt = await responseJson<AuthAttempt>(startResponse)
  await openUrl(attempt.authorizeUrl)
  const expiresAt = new Date(attempt.expiresAt).getTime()

  while (Date.now() < expiresAt) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 2000))
    const pollResponse = await fetch(backendUrl('/v1/auth/desktop/poll'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId: attempt.attemptId,
        attemptSecret: attempt.attemptSecret,
      }),
    })
    if (pollResponse.status === 202) {
      await responseJson<PollPending>(pollResponse)
      continue
    }
    if (!pollResponse.ok) throw new Error(`Не удалось завершить вход (${pollResponse.status})`)
    const result = await responseJson<PollComplete>(pollResponse)
    localStorage.setItem(TOKEN_KEY, result.accessToken)
    return result
  }

  throw new Error('Время ожидания входа через Telegram истекло')
}

export async function getCloudUser(): Promise<CloudUser> {
  const response = await authorizedRequest('/v1/me')
  if (!response.ok) throw new Error('Сессия Telegram истекла')
  return (await responseJson<{ user: CloudUser }>(response)).user
}

export async function logoutCloud(): Promise<void> {
  try {
    await authorizedRequest('/v1/session', { method: 'DELETE' })
  } finally {
    clearCloudSession()
  }
}

export async function getCloudWorkspace(): Promise<CloudWorkspace> {
  const response = await authorizedRequest('/v1/sync/workspace')
  if (!response.ok) throw new Error(`Не удалось загрузить настройки (${response.status})`)
  return responseJson<CloudWorkspace>(response)
}

export async function putCloudWorkspace(
  revision: number,
  snapshot: WorkspaceSnapshot,
): Promise<CloudWorkspace> {
  const response = await authorizedRequest('/v1/sync/workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision, payload: snapshot }),
  })
  if (response.status === 409) throw new Error('Настройки изменились на другом устройстве')
  if (!response.ok) throw new Error(`Не удалось сохранить настройки (${response.status})`)
  return responseJson<CloudWorkspace>(response)
}

export async function generateAiReply(
  request: GenerateReplyRequest,
): Promise<GenerateReplyResponse> {
  const response = await authorizedRequest('/v1/ai/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (response.status === 401) throw new Error('Войдите через Telegram в настройках')
  if (response.status === 503) throw new Error('AI ещё не настроен на сервере')
  if (response.status === 429) throw new Error('Слишком много запросов — попробуйте чуть позже')
  if (!response.ok) throw new Error(`AI-сервис ответил с ошибкой ${response.status}`)
  return responseJson<GenerateReplyResponse>(response)
}
