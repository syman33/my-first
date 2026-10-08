import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'
import { checkRequestOrigin, requestOrigin } from '@/lib/security/origin'
import { redact, redactLinkSecrets } from '@/lib/logger'

describe('Content-Security-Policy', () => {
  it('is strict in production: nonce + strict-dynamic, no eval, no framing', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'abc123',
      isDev: false,
      upgradeInsecureRequests: true,
    })
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })

  it('allows eval only in development and adds configured image origins', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'n',
      isDev: true,
      imageOrigins: ['https://cdn.example.com'],
    })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("img-src 'self' data: blob: https://cdn.example.com")
  })

  it('generates unpredictable nonces', () => {
    const nonces = new Set(Array.from({ length: 200 }, () => generateNonce()))
    expect(nonces.size).toBe(200)
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})

describe('CSRF origin check', () => {
  const allowed = ['https://velora.sa']

  it('allows safe methods regardless of origin', () => {
    expect(
      checkRequestOrigin({
        method: 'GET',
        originHeader: 'https://evil.test',
        refererHeader: null,
        allowedOrigins: allowed,
      }).ok,
    ).toBe(true)
  })

  it('accepts same-origin unsafe requests', () => {
    expect(
      checkRequestOrigin({
        method: 'POST',
        originHeader: 'https://velora.sa',
        refererHeader: null,
        allowedOrigins: allowed,
      }),
    ).toEqual({ ok: true })
  })

  it('rejects cross-site unsafe requests', () => {
    expect(
      checkRequestOrigin({
        method: 'DELETE',
        originHeader: 'https://evil.test',
        refererHeader: null,
        allowedOrigins: allowed,
      }),
    ).toEqual({
      ok: false,
      reason: 'origin-mismatch',
    })
    // A lookalike subdomain is still a different origin.
    expect(
      checkRequestOrigin({
        method: 'POST',
        originHeader: 'https://velora.sa.evil.test',
        refererHeader: null,
        allowedOrigins: allowed,
      }).ok,
    ).toBe(false)
  })

  it('falls back to Referer and rejects requests with neither header', () => {
    expect(
      checkRequestOrigin({
        method: 'POST',
        originHeader: null,
        refererHeader: 'https://velora.sa/ar/cart',
        allowedOrigins: allowed,
      }).ok,
    ).toBe(true)
    expect(
      checkRequestOrigin({
        method: 'POST',
        originHeader: 'null',
        refererHeader: null,
        allowedOrigins: allowed,
      }),
    ).toEqual({
      ok: false,
      reason: 'missing-origin',
    })
  })

  it('only honours forwarded headers behind a trusted proxy', () => {
    const headers = new Headers({ 'x-forwarded-host': 'velora.sa', 'x-forwarded-proto': 'https' })
    expect(requestOrigin('http://10.0.0.5:3000/api/x', headers, true)).toBe('https://velora.sa')
    expect(requestOrigin('http://10.0.0.5:3000/api/x', headers, false)).toBe('http://10.0.0.5:3000')
  })
})

describe('log redaction', () => {
  it('removes secrets and masks personal data recursively', () => {
    const out = redact({
      password: 'hunter2',
      passwordHash: '$argon2id$...',
      nested: {
        authorization: 'Bearer x',
        apiKey: 'k',
        token: 't',
        cardNumber: '4111111111111111',
        cvv: '123',
      },
      email: 'layla@example.com',
      phone: '+966500000000',
      orderNumber: 'VLR-2026-000001',
      company: 'kept',
    }) as Record<string, unknown>
    expect(out.password).toBe('[REDACTED]')
    expect(out.passwordHash).toBe('[REDACTED]')
    expect(out.nested).toEqual({
      authorization: '[REDACTED]',
      apiKey: '[REDACTED]',
      token: '[REDACTED]',
      cardNumber: '[REDACTED]',
      cvv: '[REDACTED]',
    })
    expect(out.email).toBe('l***@example.com')
    expect(out.phone).toBe('***0000')
    expect(out.orderNumber).toBe('VLR-2026-000001')
    expect(out.company).toBe('kept')
  })

  it('removes secrets from links inside free text, under any key', () => {
    const text =
      'Reset: https://velora.sa/ar/reset-password#token=abc123XYZ\nUnsubscribe: https://velora.sa/en/newsletter/unsubscribe?t=SEALED.value&lang=en'
    expect(redactLinkSecrets(text)).toBe(
      'Reset: https://velora.sa/ar/reset-password#token=[REDACTED]\nUnsubscribe: https://velora.sa/en/newsletter/unsubscribe?t=[REDACTED]&lang=en',
    )
    expect(redact({ preview: 'Verify: /ar/verify-email#token=s3cr3t' })).toEqual({
      preview: 'Verify: /ar/verify-email#token=[REDACTED]',
    })
    expect(redact(['see /x?code=999&page=2'])).toEqual(['see /x?code=[REDACTED]&page=2'])
    // Ordinary text is untouched.
    expect(redactLinkSecrets('Order VLR-2026-000123 shipped')).toBe('Order VLR-2026-000123 shipped')
  })

  it('handles errors and circular structures', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(redact(circular)).toEqual({ a: 1, self: '[Circular]' })
    const serialized = redact(new Error('boom')) as Record<string, unknown>
    expect(serialized.message).toBe('boom')
  })
})
