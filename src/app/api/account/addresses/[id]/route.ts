import { z } from 'zod'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { addressSchema } from '@/schemas/address'
import { deleteAddress, getAddress, updateAddress } from '@/services/account/address.service'

const idSchema = z.uuid()

function parseId(raw: string): string {
  const result = idSchema.safeParse(raw)
  if (!result.success) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
  return result.data
}

export const GET = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) =>
  ok({ address: await getAddress(ctx.user.id, parseId(ctx.params.id)) }),
)

export const PATCH = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  const id = parseId(ctx.params.id)
  const input = await ctx.body(addressSchema)
  return ok({ address: await updateAddress(ctx.user.id, id, input) })
})

export const DELETE = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  await deleteAddress(ctx.user.id, parseId(ctx.params.id))
  return noContent()
})
