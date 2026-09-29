import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
const TELEGRAM_ISSUER = 'https://oauth.telegram.org'
const TELEGRAM_AUTH_URL = `${TELEGRAM_ISSUER}/auth`
const TELEGRAM_TOKEN_URL = `${TELEGRAM_ISSUER}/token`
const TELEGRAM_JWKS = createRemoteJWKSet(new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`))

const tokenResponseSchema = z.object({ id_token: z.string().min(1) })
const telegramClaimsSchema = z.object({
  sub: z.string().min(1),
  id: z.union([z.number().int(), z.string()]).optional(),
  name: z.string().min(1).default('Telegram user'),
  preferred_username: z.string().nullable().optional(),
  picture: z.string().url().nullable().optional(),
})

export interface TelegramIdentity {
  subject: string
  telegramId: string | null
  displayName: string
  username: string | null
  avatarUrl: string | null
}

export class TelegramOidc {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly publicBaseUrl: string,
  ) {}

  createAuthorizationUrl(state: string, codeChallenge: string): string {
    const redirectUri = `${this.publicBaseUrl}/v1/auth/telegram/callback`
    const url = new URL(TELEGRAM_AUTH_URL)
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid profile')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  async exchangeAndVerify(code: string, codeVerifier: string): Promise<TelegramIdentity> {
    const redirectUri = `${this.publicBaseUrl}/v1/auth/telegram/callback`
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`, 'utf8').toString(
      'base64',
    )
    const response = await fetch(TELEGRAM_TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${credentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Telegram token exchange failed with status ${response.status}`)
    }

    const tokenResponse = tokenResponseSchema.parse(await response.json())
    const verified = await jwtVerify(tokenResponse.id_token, TELEGRAM_JWKS, {
      issuer: TELEGRAM_ISSUER,
      audience: this.clientId,
      algorithms: ['RS256'],
    })
    const claims = telegramClaimsSchema.parse(verified.payload)
    return {
      subject: claims.sub,
      telegramId: claims.id === undefined ? null : String(claims.id),
      displayName: claims.name,
      username: claims.preferred_username ?? null,
      avatarUrl: claims.picture ?? null,
    }
  }
}
