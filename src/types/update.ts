export type UpdateState =
  'checking' | 'available' | 'downloading' | 'installing' | 'upToDate' | 'error'

export interface UpdateStatus {
  state: UpdateState
  message: string
  version: string | null
  progress: number | null
}
