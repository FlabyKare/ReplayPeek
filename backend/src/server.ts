import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { loadConfig, type AppConfig } from './config.js'
import { hashSecret, pkceChallenge, randomToken, secretMatches, sha256 } from './crypto.js'
import { createPool, firstRow, inTransaction } from './db.js'
import { TelegramOidc, type TelegramIdentity } from './telegram.js'

const startBodySchema = z.object({ deviceName: z.string().trim().min(1).max(80).optional() })
const pollBodySchema = z.object({
  attemptId: z.string().uuid(),
  attemptSecret: z.string().min(32).max(256),
})
const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(32).max(256),
})
const workspaceBodySchema = z.object({
  revision: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
})

interface UserRow {
  id: string
  telegram_sub: string
  telegram_id: string | null
  display_name: string
  username: string | null
  avatar_url: string | null
}

interface AuthAttemptRow {
  id: string
  secret_hash: string
  code_verifier: string
  status: 'pending' | 'completed' | 'consumed'
  user_id: string | null
  expires_at: Date
}

interface WorkspaceRow {
  revision: string
  payload: Record<string, unknown>
  updated_at: Date
}

interface SessionUser {
  sessionId: string
  user: UserRow
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    telegramId: user.telegram_id,
    displayName: user.display_name,
    username: user.username,
    avatarUrl: user.avatar_url,
  }
}

function successPage(): string {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ReplayPeek</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f8fafc;font:16px system-ui}.card{max-width:480px;padding:32px;border:1px solid #283047;border-radius:18px;background:#121622;text-align:center}h1{margin-top:0;color:#a78bfa}p{color:#a8b0c4;line-height:1.6}</style><main class="card"><h1>ReplayPeek подключён</h1><p>Авторизация Telegram завершена. Вернитесь в приложение — профиль синхронизируется автоматически.</p></main></html>`
}

async function upsertUser(client: PoolClient, identity: TelegramIdentity): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `INSERT INTO users (id, telegram_sub, telegram_id, display_name, username, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (telegram_sub) DO UPDATE SET
       telegram_id = EXCLUDED.telegram_id,
       display_name = EXCLUDED.display_name,
       username = EXCLUDED.username,
       avatar_url = EXCLUDED.avatar_url,
       updated_at = now()
     RETURNING id, telegram_sub, telegram_id, display_name, username, avatar_url`,
    [
      randomUUID(),
      identity.subject,
      identity.telegramId,
      identity.displayName,
      identity.username,
      identity.avatarUrl,
    ],
  )
  const user = firstRow(result)
  if (!user) throw new Error('Telegram user upsert returned no row')
  return user
}

async function authenticate(
  request: FastifyRequest,
  pool: Pool,
  config: AppConfig,
): Promise<SessionUser | null> {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length).trim()
  if (!token) return null
  const result = await pool.query<UserRow & { session_id: string }>(
    `SELECT s.id AS session_id, u.id, u.telegram_sub, u.telegram_id,
            u.display_name, u.username, u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSecret(token, config.tokenPepper)],
  )
  const row = firstRow(result)
  if (!row) return null
  void pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id])
  return { sessionId: row.session_id, user: row }
}

export async function buildServer(config = loadConfig()) {
  const app = Fastify({ logger: true, bodyLimit: 600 * 1024, trustProxy: true })
  const pool = createPool(config)
  const telegram =
    config.telegramClientId && config.telegramClientSecret
      ? new TelegramOidc(config.telegramClientId, config.telegramClientSecret, config.publicBaseUrl)
      : null

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true)
      else callback(new Error('Origin is not allowed'), false)
    },
  })

  app.addHook('onClose', () => pool.end())

  app.get('/health', () => ({ status: 'ok', service: 'replaypeek-sync-api' }))
  app.get('/ready', async (_request, reply) => {
    await pool.query('SELECT 1')
    return reply.send({ status: 'ready' })
  })

  app.post(
    '/v1/auth/desktop/start',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!telegram) {
        return reply.code(503).send({ error: 'telegram_auth_not_configured' })
      }
      startBodySchema.parse(request.body ?? {})
      const attemptId = randomUUID()
      const attemptSecret = randomToken()
      const state = randomToken()
      const codeVerifier = randomToken(48)
      const expiresAt = new Date(Date.now() + 10 * 60_000)
      await pool.query(
        `INSERT INTO auth_attempts
        (id, secret_hash, state_hash, code_verifier, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [
          attemptId,
          hashSecret(attemptSecret, config.tokenPepper),
          sha256(state),
          codeVerifier,
          expiresAt,
        ],
      )
      return reply.code(201).send({
        attemptId,
        attemptSecret,
        authorizeUrl: telegram.createAuthorizationUrl(state, pkceChallenge(codeVerifier)),
        expiresAt: expiresAt.toISOString(),
      })
    },
  )

  app.get('/v1/auth/telegram/callback', async (request, reply) => {
    if (!telegram) {
      return reply.code(503).type('text/plain').send('Telegram authentication is not configured.')
    }
    const query = callbackQuerySchema.parse(request.query)
    const attemptResult = await pool.query<AuthAttemptRow>(
      `SELECT id, secret_hash, code_verifier, status, user_id, expires_at
         FROM auth_attempts
        WHERE state_hash = $1 AND expires_at > now()`,
      [sha256(query.state)],
    )
    const attempt = firstRow(attemptResult)
    if (!attempt || attempt.status !== 'pending') {
      return reply.code(400).type('text/plain').send('Authorization attempt is invalid or expired.')
    }

    const identity = await telegram.exchangeAndVerify(query.code, attempt.code_verifier)
    await inTransaction(pool, async (client) => {
      const claimed = await client.query<{ id: string }>(
        `SELECT id FROM auth_attempts
          WHERE id = $1 AND status = 'pending' AND expires_at > now()
          FOR UPDATE`,
        [attempt.id],
      )
      if (!firstRow(claimed)) throw new Error('Authorization attempt was already completed')
      const user = await upsertUser(client, identity)
      await client.query(
        `UPDATE auth_attempts
            SET status = 'completed', user_id = $1, completed_at = now()
          WHERE id = $2 AND status = 'pending'`,
        [user.id, attempt.id],
      )
      await client.query(
        `INSERT INTO user_workspaces (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      )
    })
    return reply.type('text/html; charset=utf-8').send(successPage())
  })

  app.post(
    '/v1/auth/desktop/poll',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = pollBodySchema.parse(request.body)
      const response = await inTransaction(pool, async (client) => {
        const result = await client.query<AuthAttemptRow>(
          `SELECT id, secret_hash, code_verifier, status, user_id, expires_at
           FROM auth_attempts WHERE id = $1 FOR UPDATE`,
          [body.attemptId],
        )
        const attempt = firstRow(result)
        if (
          !attempt ||
          attempt.expires_at.getTime() <= Date.now() ||
          !secretMatches(body.attemptSecret, attempt.secret_hash, config.tokenPepper)
        ) {
          return { kind: 'invalid' as const }
        }
        if (attempt.status === 'pending') return { kind: 'pending' as const }
        if (attempt.status === 'consumed' || !attempt.user_id) return { kind: 'consumed' as const }

        const userResult = await client.query<UserRow>(
          `SELECT id, telegram_sub, telegram_id, display_name, username, avatar_url
           FROM users WHERE id = $1`,
          [attempt.user_id],
        )
        const user = firstRow(userResult)
        if (!user) return { kind: 'invalid' as const }
        const accessToken = randomToken(48)
        const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000)
        await client.query(
          `INSERT INTO sessions (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
          [randomUUID(), user.id, hashSecret(accessToken, config.tokenPepper), expiresAt],
        )
        await client.query("UPDATE auth_attempts SET status = 'consumed' WHERE id = $1", [
          attempt.id,
        ])
        return { kind: 'complete' as const, accessToken, expiresAt, user }
      })

      if (response.kind === 'pending') return reply.code(202).send({ status: 'pending' })
      if (response.kind === 'complete') {
        return reply.send({
          status: 'complete',
          accessToken: response.accessToken,
          expiresAt: response.expiresAt.toISOString(),
          user: publicUser(response.user),
        })
      }
      return reply.code(response.kind === 'consumed' ? 410 : 401).send({
        error: response.kind === 'consumed' ? 'auth_attempt_consumed' : 'auth_attempt_invalid',
      })
    },
  )

  app.get('/v1/me', async (request, reply) => {
    const session = await authenticate(request, pool, config)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })
    return { user: publicUser(session.user) }
  })

  app.delete('/v1/session', async (request, reply) => {
    const session = await authenticate(request, pool, config)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })
    await pool.query('DELETE FROM sessions WHERE id = $1', [session.sessionId])
    return reply.code(204).send()
  })

  app.get('/v1/sync/workspace', async (request, reply) => {
    const session = await authenticate(request, pool, config)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })
    const result = await pool.query<WorkspaceRow>(
      'SELECT revision, payload, updated_at FROM user_workspaces WHERE user_id = $1',
      [session.user.id],
    )
    const workspace = firstRow(result)
    return {
      revision: Number(workspace?.revision ?? 0),
      payload: workspace?.payload ?? {},
      updatedAt: workspace?.updated_at.toISOString() ?? null,
    }
  })

  app.put('/v1/sync/workspace', async (request, reply) => {
    const session = await authenticate(request, pool, config)
    if (!session) return reply.code(401).send({ error: 'unauthorized' })
    const body = workspaceBodySchema.parse(request.body)
    const serializedPayload = JSON.stringify(body.payload)
    if (Buffer.byteLength(serializedPayload, 'utf8') > 512 * 1024) {
      return reply.code(413).send({ error: 'workspace_too_large' })
    }
    const result = await pool.query<WorkspaceRow>(
      `UPDATE user_workspaces
          SET payload = $1::jsonb, revision = revision + 1, updated_at = now()
        WHERE user_id = $2 AND revision = $3
        RETURNING revision, payload, updated_at`,
      [serializedPayload, session.user.id, body.revision],
    )
    const workspace = firstRow(result)
    if (!workspace) {
      const current = await pool.query<WorkspaceRow>(
        'SELECT revision, payload, updated_at FROM user_workspaces WHERE user_id = $1',
        [session.user.id],
      )
      const currentWorkspace = firstRow(current)
      return reply.code(409).send({
        error: 'revision_conflict',
        current: currentWorkspace
          ? {
              revision: Number(currentWorkspace.revision),
              payload: currentWorkspace.payload,
              updatedAt: currentWorkspace.updated_at.toISOString(),
            }
          : null,
      })
    }
    return {
      revision: Number(workspace.revision),
      payload: workspace.payload,
      updatedAt: workspace.updated_at.toISOString(),
    }
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, 'request failed')
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'invalid_request', details: error.issues })
    }
    return reply.code(500).send({ error: 'internal_error' })
  })

  await pool.query('DELETE FROM auth_attempts WHERE expires_at <= now()')
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()')

  return app
}

async function main(): Promise<void> {
  const config = loadConfig()
  const app = await buildServer(config)
  await app.listen({ host: '0.0.0.0', port: config.port })
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
