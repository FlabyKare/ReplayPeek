import { openUrl } from '@tauri-apps/plugin-opener'

export interface TelegramAuthStartResult {
  started: boolean
  message: string
}

export async function startTelegramAuth(): Promise<TelegramAuthStartResult> {
  const authUrl = import.meta.env.VITE_TELEGRAM_AUTH_URL
  if (!authUrl) {
    return {
      started: false,
      message:
        'Нужны Telegram Client ID и HTTPS sync backend. Интерфейс и профильный слой уже готовы.',
    }
  }

  try {
    await openUrl(authUrl)
  } catch {
    return {
      started: false,
      message: 'Не удалось открыть авторизацию в браузере. Проверьте адрес sync backend.',
    }
  }

  return {
    started: true,
    message: 'Завершите вход в открывшемся окне Telegram.',
  }
}
