import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { checkoutPreviewSchema } from '@/schemas/checkout'
import { getCartView } from '@/services/cart/cart.service'
import { paymentMethodOptions } from '@/services/payments/methods'
import { getSettings } from '@/services/settings/settings.service'

/** Server-computed totals for the chosen delivery and payment method (nothing is computed in the browser). */
export const GET = apiHandler({ auth: 'user' }, async (ctx) => {
  const { shippingMethod, paymentMethod } = ctx.query(checkoutPreviewSchema)
  const [cart, payments, cod] = await Promise.all([
    getCartView({ userId: ctx.user.id }, ctx.locale, {
      userId: ctx.user.id,
      shippingMethod,
      paymentMethod: paymentMethod ?? null,
    }),
    getSettings('payments'),
    getSettings('cod'),
  ])
  return ok({ cart, paymentOptions: paymentMethodOptions(payments, cod, cart.totals) })
})
