import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashSecret(value: string, pepper: string): string {
  return sha256(`${pepper}:${value}`)
}

export function secretMatches(value: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashSecret(value, pepper), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}
