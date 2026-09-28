import { describe, expect, it } from 'vitest'
import { EnvValidationError, parseEnv } from '@/lib/env'

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'x'.repeat(40),
  MOCK_PAYMENT_WEBHOOK_SECRET: 'mock-secret',
}

describe('environment validation', () => {
  it('accepts a valid development configuration with safe defaults', () => {
    const env = parseEnv(base)
    expect(env.PAYMENT_PROVIDER).toBe('mock')
    expect(env.RATE_LIMIT_PROVIDER).toBe('postgres')
    expect(env.appEnv).toBe('development')
  })

  it('lists every problem at once', () => {
    try {
      parseEnv({ NODE_ENV: 'development' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const message = (error as Error).message
      expect(message).toContain('DATABASE_URL')
      expect(message).toContain('NEXT_PUBLIC_APP_URL')
      expect(message).toContain('AUTH_SECRET')
    }
  })

  it('rejects weak secrets', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/)
  })

  it('refuses development-only providers in production unless explicitly allowed', () => {
    const prod = { ...base, NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://velora.sa', CRON_SECRET: 'c'.repeat(40) }
    expect(() => parseEnv(prod)).toThrow(/mock payment provider is development-only/)
    expect(() => parseEnv({ ...prod, ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: 'true' })).not.toThrow()
  })

  it('requires https and a cron secret in production', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'http://velora.sa',
      ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: 'true',
    }
    const message = (() => {
      try {
        parseEnv(prod)
        return ''
      } catch (e) {
        return (e as Error).message
      }
    })()
    expect(message).toContain('must use https')
    expect(message).toContain('CRON_SECRET')
  })

  it('requires credentials for real providers', () => {
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: 'moyasar' })).toThrow(/MOYASAR_SECRET_KEY/)
    expect(() => parseEnv({ ...base, STORAGE_PROVIDER: 's3' })).toThrow(/STORAGE_BUCKET/)
    expect(() => parseEnv({ ...base, EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/)
  })
})
