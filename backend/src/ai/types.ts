export type ReplyLanguage = 'ru' | 'en'
export type ReplyStyle = 'sarcastic' | 'funny' | 'calm' | 'smart'

export interface GenerateReplyRequest {
  message: string
  language: ReplyLanguage
  style: ReplyStyle
}

export interface GeneratedReply {
  reply: string
  model: string
}

export interface ReplyProvider {
  generate(request: GenerateReplyRequest): Promise<GeneratedReply>
}
