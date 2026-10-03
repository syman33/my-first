import { describe, expect, it } from 'vitest'
import { postAuthRedirect, safeRedirectPath } from '@/utils/redirect'
import { switchLocalePath } from '@/utils/locale-path'

describe('safeRedirectPath (open-redirect protection)', () => {
  const fallback = '/ar/account'

  it('keeps same-site paths with query and hash', () => {
    expect(safeRedirectPath('/ar/checkout?step=2#payment', fallback)).toBe(
      '/ar/checkout?step=2#payment',
    )
    expect(safeRedirectPath('/admin/orders', fallback)).toBe('/admin/orders')
  })

  it.each([
    ['absolute URL', 'https://evil.example/phish'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['embedded backslash', '/ar\\..\\evil'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'ar/account'],
    ['control character', '/ar/\u0000account'],
    ['tab injection', '/\t/evil.example'],
    ['empty', ''],
    ['too long', `/${'a'.repeat(600)}`],
  ])('rejects %s', (_label, target) => {
    expect(safeRedirectPath(target, fallback)).toBe(fallback)
  })

  it('rejects null and undefined', () => {
    expect(safeRedirectPath(null, fallback)).toBe(fallback)
    expect(safeRedirectPath(undefined, fallback)).toBe(fallback)
  })

  it('normalises dot segments without leaving the site', () => {
    expect(safeRedirectPath('/ar/../en/cart', fallback)).toBe('/en/cart')
  })
})

describe('postAuthRedirect', () => {
  it('never sends a signed-in user back to an authentication page', () => {
    expect(postAuthRedirect('/ar/login', '/ar/account')).toBe('/ar/account')
    expect(postAuthRedirect('/en/register?next=/en/cart', '/en/account')).toBe('/en/account')
    expect(postAuthRedirect('/ar/reset-password', '/ar/account')).toBe('/ar/account')
  })

  it('allows ordinary destinations', () => {
    expect(postAuthRedirect('/ar/checkout', '/ar/account')).toBe('/ar/checkout')
    expect(postAuthRedirect('/en/login-help', '/en/account')).toBe('/en/login-help')
  })
})

describe('switchLocalePath', () => {
  it('swaps the locale segment and keeps the rest', () => {
    expect(switchLocalePath('/ar/product/leather-tote?color=black', 'en')).toBe(
      '/en/product/leather-tote?color=black',
    )
    expect(switchLocalePath('/en', 'ar')).toBe('/ar')
    expect(switchLocalePath('/ar/', 'en')).toBe('/en')
  })

  it('adds a locale when missing', () => {
    expect(switchLocalePath('/', 'en')).toBe('/en')
    expect(switchLocalePath('/shop', 'ar')).toBe('/ar/shop')
  })
})
