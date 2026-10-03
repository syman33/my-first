import { z } from 'zod'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { setDefaultAddress } from '@/services/account/address.service'

export const POST = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  const parsed = z.uuid().safeParse(ctx.params.id)
  if (!parsed.success) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
  return ok({ address: await setDefaultAddress(ctx.user.id, parsed.data) })
})
