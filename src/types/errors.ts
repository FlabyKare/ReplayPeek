export interface AppErrorPayload {
  code: string
  message: string
}

export interface RuntimeStatus {
  hotkeyRegistered: boolean
  warning: AppErrorPayload | null
}

export class AppError extends Error {
  readonly code: string

  constructor(payload: AppErrorPayload) {
    super(payload.message)
    this.name = 'AppError'
    this.code = payload.code
  }
}

export function toAppError(error: unknown): AppError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new AppError({ code: error.code, message: error.message })
  }

  if (error instanceof Error) {
    return new AppError({ code: 'frontend_error', message: error.message })
  }

  return new AppError({ code: 'unknown_error', message: String(error) })
}
