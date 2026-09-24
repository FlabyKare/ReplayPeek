import { invoke } from '@tauri-apps/api/core'
import { AppError, toAppError } from '@/types/errors'

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error: unknown) {
    const appError = toAppError(error)
    console.error(`[${appError.code}] ${command}: ${appError.message}`)
    throw appError
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
