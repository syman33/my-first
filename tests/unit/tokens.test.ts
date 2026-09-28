import { describe, expect, it } from 'vitest'
import { fingerprint, generateToken, hashToken, safeEqual, sealSecret, unsealSecret } from '@/lib/security/tokens'
import { checkPasswordPolicy, needsRehash } from '@/lib/auth/password'

describe('tokens', () => {
  it('generates 256-bit url-safe tokens', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(Array.from({ length: 100 }, () => generateToken())).size).toBe(100)
  })

  it('hashes deterministically with a keyed HMAC', () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(t)).not.toBe(hashToken(`${t}x`))
  })

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  it('seals and unseals secrets, rejecting tampering', () => {
    const sealed = sealSecret('https://velora.sa/ar/reset-password?token=abc')
    expect(sealed).not.toContain('reset-password')
    expect(unsealSecret(sealed)).toBe('https://velora.sa/ar/reset-password?token=abc')
    const parts = sealed.split('.')
    parts[3] = `${parts[3]!.slice(0, -2)}AA`
    expect(() => unsealSecret(parts.join('.'))).toThrow()
    expect(() => unsealSecret('garbage')).toThrow()
  })

  it('fingerprints are independent of key order', () => {
    expect(fingerprint({ a: 1, b: [1, 2], c: { x: 1, y: 2 } })).toBe(fingerprint({ c: { y: 2, x: 1 }, b: [1, 2], a: 1 }))
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }))
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ a: 1 }))
  })
})

describe('password policy', () => {
  it('enforces length and blocks common passwords', () => {
    expect(checkPasswordPolicy('short')).toBe('passwordTooShort')
    expect(checkPasswordPolicy('x'.repeat(129))).toBe('passwordTooLong')
    expect(checkPasswordPolicy('Password123')).toBe('passwordTooCommon')
    expect(checkPasswordPolicy('aaaaaaaaaa')).toBe('passwordTooCommon')
    expect(checkPasswordPolicy('laylaahmed', { email: 'laylaahmed@example.com' })).toBe('passwordTooCommon')
    expect(checkPasswordPolicy('Desert-Rose-2026')).toBeNull()
    expect(checkPasswordPolicy('ChangeMe123!')).toBeNull()
  })

  it('flags hashes produced with weaker parameters for rehash', () => {
    expect(needsRehash('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')).toBe(false)
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true)
    expect(needsRehash('$2b$10$legacy-bcrypt-hash')).toBe(true)
  })
})
