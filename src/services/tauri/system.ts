import type { RuntimeStatus } from '@/types/errors'
import { invokeCommand } from './client'

export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invokeCommand<RuntimeStatus>('get_runtime_status')
}
