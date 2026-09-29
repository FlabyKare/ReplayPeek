import { describe, expect, it } from 'vitest'
import { hashSecret, pkceChallenge, randomToken, secretMatches } from './crypto.js'

describe('crypto helpers', () => {
  it('creates URL-safe random tokens', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('verifies peppered secret hashes', () => {
    const hash = hashSecret('secret', 'pepper'.repeat(8))
    expect(secretMatches('secret', hash, 'pepper'.repeat(8))).toBe(true)
    expect(secretMatches('wrong', hash, 'pepper'.repeat(8))).toBe(false)
  })

  it('produces an S256 PKCE challenge', () => {
    expect(pkceChallenge('verifier')).toBe('iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ')
  })
})
