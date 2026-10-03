import { describe, expect, it } from 'vitest'
import { activeAdminNavKey, ADMIN_NAV, visibleAdminNav } from '@/lib/admin/navigation'
import { dateParam, enumParam, listHref, pageParam, searchParam } from '@/lib/admin/params'

describe('admin navigation', () => {
  it('shows administrators every section', () => {
    const all = ADMIN_NAV.flatMap((group) => group.items).length
    const visible = visibleAdminNav({ id: 'a', role: 'ADMIN', permissions: [] })
    expect(visible.flatMap((group) => group.items)).toHaveLength(all)
  })

  it('shows staff only what their permissions open, dropping empty groups', () => {
    const visible = visibleAdminNav({
      id: 's',
      role: 'STAFF',
      permissions: ['DASHBOARD_VIEW', 'ORDERS_VIEW', 'MESSAGES_VIEW'],
    })
    expect(visible.map((group) => group.group)).toEqual(['overview', 'sales', 'content'])
    expect(visible.flatMap((group) => group.items.map((item) => item.key))).toEqual([
      'dashboard',
      'orders',
      'returns',
      'messages',
    ])
  })

  it('shows customers nothing', () => {
    expect(visibleAdminNav({ id: 'c', role: 'CUSTOMER', permissions: ['DASHBOARD_VIEW'] })).toEqual(
      [],
    )
  })

  it('marks the section of nested pages as current', () => {
    expect(activeAdminNavKey('/admin')).toBe('dashboard')
    expect(activeAdminNavKey('/admin/orders')).toBe('orders')
    expect(activeAdminNavKey('/admin/orders/0192')).toBe('orders')
    expect(activeAdminNavKey('/admin/import-export')).toBe('importExport')
    expect(activeAdminNavKey('/admin/ordersx')).toBeNull()
    expect(activeAdminNavKey('/en/account')).toBeNull()
  })
})

describe('admin list params', () => {
  it('falls back to safe defaults for malformed values', () => {
    expect(pageParam({ page: '3' })).toBe(3)
    expect(pageParam({ page: '0' })).toBe(1)
    expect(pageParam({ page: 'abc' })).toBe(1)
    expect(pageParam({ page: ['2', '9'] })).toBe(2)
    expect(searchParam({ q: '  ring  ' })).toBe('ring')
    expect(searchParam({ q: '   ' })).toBeUndefined()
    expect(searchParam({ q: 'x'.repeat(500) })).toHaveLength(100)
    expect(enumParam({ status: 'PAID' }, 'status', ['PAID', 'PENDING'] as const)).toBe('PAID')
    expect(enumParam({ status: 'DROP TABLE' }, 'status', ['PAID'] as const)).toBeUndefined()
  })

  it('reads dates as store-local days', () => {
    expect(dateParam({ from: '2026-09-28' }, 'from')?.toISOString()).toBe(
      '2026-09-27T21:00:00.000Z',
    )
    expect(dateParam({ from: '2026-02-30' }, 'from')).toBeUndefined()
    expect(dateParam({ from: 'yesterday' }, 'from')).toBeUndefined()
  })

  it('rebuilds list URLs keeping filters and dropping page 1', () => {
    expect(listHref('/admin/orders', { q: 'VLR', status: 'PAID', page: '2' }, { page: 3 })).toBe(
      '/admin/orders?q=VLR&status=PAID&page=3',
    )
    expect(listHref('/admin/orders', { q: 'VLR', page: '2' }, { page: 1 })).toBe(
      '/admin/orders?q=VLR',
    )
    expect(listHref('/admin/orders', { q: 'VLR' }, { q: undefined })).toBe('/admin/orders')
  })
})
