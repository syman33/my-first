import { apiHandler } from '@/lib/api/handler'
import { created, ok } from '@/lib/api/responses'
import { addressSchema } from '@/schemas/address'
import { createAddress, listAddresses } from '@/services/account/address.service'

export const GET = apiHandler({ auth: 'user' }, async (ctx) =>
  ok({ addresses: await listAddresses(ctx.user.id) }),
)

export const POST = apiHandler({ auth: 'user' }, async (ctx) => {
  const input = await ctx.body(addressSchema)
  return created({ address: await createAddress(ctx.user.id, input) })
})
