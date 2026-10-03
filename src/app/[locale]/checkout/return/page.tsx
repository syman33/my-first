import type { Metadata, Route } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ButtonLink } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { reconcilePayment } from '@/services/payments/payment.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/checkout/return'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).checkout.return.processingTitle,
    robots: { index: false, follow: false },
  }
}

/**
 * Where the payment page sends the customer back. Arriving here proves
 * nothing: the payment is re-checked with the provider server-side and the
 * page reflects the database state only.
 */
export default async function PaymentReturnPage({
  params,
  searchParams,
}: PageProps<'/[locale]/checkout/return'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const raw = (await searchParams).payment
  const paymentId = uuidField.safeParse(typeof raw === 'string' ? raw : '')
  if (!paymentId.success) notFound()
  const { user } = await requireUserPage(
    locale,
    `/${locale}/checkout/return?payment=${paymentId.data}`,
  )

  let result
  try {
    result = await reconcilePayment(paymentId.data, user.id)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') notFound()
    throw error
  }
  if (result.status === 'PAID')
    redirect(`/${locale}/checkout/confirmation/${result.orderNumber}` as Route)

  const t = getDictionary(locale).checkout.return
  const failed = result.status === 'FAILED'
  const cancelled = result.status === 'CANCELLED'
  return (
    <div className="container-luxe flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <h1 className="font-display text-4xl text-ink">
        {failed ? t.failedTitle : cancelled ? t.cancelledTitle : t.processingTitle}
      </h1>
      <p className="mt-4 max-w-lg text-text" data-testid="payment-return-status">
        {failed || cancelled ? t.failed : t.processing}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {failed || cancelled ? (
          <ButtonLink href={`/${locale}/cart`}>{t.backToBag}</ButtonLink>
        ) : (
          <ButtonLink href={`/${locale}/checkout/return?payment=${paymentId.data}` as Route}>
            {t.checkAgain}
          </ButtonLink>
        )}
        <ButtonLink
          href={`/${locale}/account/orders/${result.orderId}` as Route}
          variant="secondary"
        >
          {t.viewOrder}
        </ButtonLink>
      </div>
    </div>
  )
}
