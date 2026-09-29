import type { AppLanguage, ReplyStyle } from './settings'

export interface GenerateReplyRequest {
  message: string
  language: AppLanguage
  style: ReplyStyle
}

export interface GenerateReplyResponse {
  reply: string
  model: string
}
