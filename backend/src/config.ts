import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  PUBLIC_BASE_URL: z.string().url(),
  TELEGRAM_CLIENT_ID: z.string().default(''),
  TELEGRAM_CLIENT_SECRET: z.string().default(''),
  TOKEN_PEPPER: z.string().min(32),
  CORS_ORIGINS: z.string().default(''),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  databaseSsl: boolean
  publicBaseUrl: string
  telegramClientId: string | null
  telegramClientSecret: string | null
  tokenPepper: string
  corsOrigins: string[]
  sessionTtlDays: number
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = environmentSchema.parse(environment)
  const hasTelegramClientId = value.TELEGRAM_CLIENT_ID.length > 0
  const hasTelegramClientSecret = value.TELEGRAM_CLIENT_SECRET.length > 0
  if (hasTelegramClientId !== hasTelegramClientSecret) {
    throw new Error('TELEGRAM_CLIENT_ID and TELEGRAM_CLIENT_SECRET must be configured together')
  }
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    databaseSsl: value.DATABASE_SSL === 'true',
    publicBaseUrl: value.PUBLIC_BASE_URL.replace(/\/$/, ''),
    telegramClientId: hasTelegramClientId ? value.TELEGRAM_CLIENT_ID : null,
    telegramClientSecret: hasTelegramClientSecret ? value.TELEGRAM_CLIENT_SECRET : null,
    tokenPepper: value.TOKEN_PEPPER,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    sessionTtlDays: value.SESSION_TTL_DAYS,
  }
}
