import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/i18n'
import { AUDIT_ENTITY_TYPES, auditEntityHref, retryability } from '@/services/admin/logs.service'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('audit log viewer', () => {
  it('knows every entity type the code records, with labels in both languages', () => {
    const recorded = new Set<string>()
    for (const file of sourceFiles(path.resolve('src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/entityType: '([a-z_]+)'/g)) {
        recorded.add(match[1]!)
      }
    }
    expect(recorded.size).toBeGreaterThan(10)
    for (const type of recorded) expect(AUDIT_ENTITY_TYPES, type).toContain(type)
    for (const locale of ['ar', 'en'] as const) {
      const labels = getDictionary(locale).admin.audit.entityTypes
      for (const type of AUDIT_ENTITY_TYPES) expect(labels[type], `${locale}.${type}`).toBeTruthy()
    }
  })

  it('links entries to the page that manages them', () => {
    const id = '0190a8f2-1c3d-7e4f-8a9b-0c1d2e3f4a5b'
    expect(auditEntityHref('order', id)).toBe(`/admin/orders/${id}`)
    expect(auditEntityHref('variant', id)).toBe(`/admin/inventory/${id}`)
    expect(auditEntityHref('settings', 'shipping')).toBe('/admin/settings?group=shipping')
    expect(auditEntityHref('user', id, 'CUSTOMER')).toBe(`/admin/customers/${id}`)
    expect(auditEntityHref('user', id, 'ADMIN')).toBe('/admin/staff')
    // A user that no longer resolves, or an entry without an id, has no link.
    expect(auditEntityHref('user', id)).toBeNull()
    expect(auditEntityHref('order', null)).toBeNull()
    expect(auditEntityHref('payment', id)).toBeNull()
  })
})

describe('resending failed notifications', () => {
  const event = (status: string, payload: unknown = { orderId: 'x' }) => ({ status, payload })

  it('only re-runs finished events whose payload is still intact', () => {
    expect(retryability('SENT', event('PROCESSED'))).toBe('NOT_FAILED')
    expect(retryability('SKIPPED', event('PROCESSED'))).toBe('NOT_FAILED')
    expect(retryability('FAILED', null)).toBe('NO_EVENT')
    expect(retryability('FAILED', event('PENDING'))).toBe('SCHEDULED')
    expect(retryability('FAILED', event('PROCESSING'))).toBe('SCHEDULED')
    expect(retryability('FAILED', event('FAILED'))).toBe('RETRYABLE')
    expect(retryability('FAILED', event('PROCESSED'))).toBe('RETRYABLE')
    expect(
      retryability('FAILED', event('FAILED', { userId: 'u', sealedResetUrl: '[purged]' })),
    ).toBe('LINK_EXPIRED')
  })
})
