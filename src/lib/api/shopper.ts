import 'server-only'
import type { NextResponse } from 'next/server'
import { guestIdentity, readGuestTokenHash, setGuestCookie } from '@/services/cart/guest-identity'
import type { ShopperOwner } from '@/types/cart'
import type { BaseContext } from './handler'

export interface ShopperResolution {
  owner: ShopperOwner | null
  /** Persist a newly issued guest identity (and refresh its expiry) on the response. */
  finalize<T extends NextResponse>(response: T): T
}

/**
 * Who is shopping: the signed-in customer, or a guest identified by an
 * httpOnly cookie. With `create`, a guest without a cookie gets one.
 */
export function resolveShopper(ctx: BaseContext, options: { create: boolean }): ShopperResolution {
  if (ctx.user) return { owner: { userId: ctx.user.id }, finalize: (response) => response }
  if (!options.create) {
    const tokenHash = readGuestTokenHash(ctx.req)
    return {
      owner: tokenHash ? { guestTokenHash: tokenHash } : null,
      finalize: (response) => response,
    }
  }
  const identity = guestIdentity(ctx.req)
  return {
    owner: { guestTokenHash: identity.tokenHash },
    finalize(response) {
      setGuestCookie(response, identity.token)
      return response
    },
  }
}
