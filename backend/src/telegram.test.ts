import { describe, expect, it } from 'vitest'
import { selectTelegramIdentityToken } from './telegram.js'

const jwt = 'header.payload.signature'

describe('selectTelegramIdentityToken', () => {
  it('uses the OpenID id_token when present', () => {
    expect(selectTelegramIdentityToken({ id_token: jwt, access_token: 'other.jwt.value' })).toBe(
      jwt,
    )
  })

  it('accepts a JWT-shaped access token for later cryptographic verification', () => {
    expect(selectTelegramIdentityToken({ access_token: jwt, token_type: 'Bearer' })).toBe(jwt)
  })

  it('rejects an opaque access token', () => {
    expect(() => selectTelegramIdentityToken({ access_token: 'opaque-secret' })).toThrow(
      'Telegram token response has no signed identity token (fields: access_token)',
    )
  })

  it('reports an OAuth provider error without exposing tokens', () => {
    expect(() =>
      selectTelegramIdentityToken({
        error: 'invalid_grant',
        error_description: 'The authorization code has expired',
      }),
    ).toThrow('Telegram token exchange returned invalid_grant: The authorization code has expired')
  })
})
