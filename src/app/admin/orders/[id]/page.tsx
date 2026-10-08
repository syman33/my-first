import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, ExternalLink, FileText, Printer } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { OrderActions } from '@/components/admin/orders/order-actions'
import {
  AdminPageHeader,
  Badge,
  Card,
  DataTable,
  DefinitionList,
  Td,
  Th,
} from '@/components/admin/ui'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary, interpolate } from '@/i18n'
import { formatBasisPoints, formatDateTime, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import {
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  RETURN_STATUS_TONE,
} from '@/lib/admin/status-tones'
import { hasPermission } from '@/lib/auth/permissions'
import { env } from '@/lib/env'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getAdminOrder } from '@/services/admin/orders.service'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.orders.title }
}

async function load(rawId: string) {
  const id = uuidField.safeParse(rawId)
  if (!id.success) return null
  try {
    return await getAdminOrder(id.data)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') return null
    throw error
  }
}

export default async function AdminOrderPage({ params }: PageProps<'/admin/orders/[id]'>) {
  const { id } = await params
  const access = await adminAccess('ORDERS_VIEW', `/admin/orders/${id}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const order = await load(id)
  if (!order) notFound()
  const { locale, dict, session } = access
  const t = dict.admin.orders
  const d = t.detail
  const ar = locale === 'ar'
  const money = (value: number) => formatMoney(value, locale)
  const attention = order.attentionReason
    ? ((t.attentionReasons as Record<string, string>)[order.attentionReason] ??
      order.attentionReason)
    : null
  const canManage = hasPermission(session.user, 'ORDERS_MANAGE')
  const canRefund = hasPermission(session.user, 'ORDERS_REFUND')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/orders', label: d.back }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="ltr-nums">{interpolate(d.title, { number: order.orderNumber })}</span>
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{dict.orders.status[order.status]}</Badge>
            <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]}>
              {dict.orders.paymentStatus[order.paymentStatus]}
            </Badge>
          </span>
        }
        description={interpolate(d.placed, { date: formatDateTime(order.createdAt, locale) })}
        actions={
          <>
            <Link
              href={`/admin/orders/${order.id}/invoice` as Route}
              className={buttonClasses('subtle', 'sm')}
              target="_blank"
            >
              <FileText className="size-4" aria-hidden="true" />
              {d.invoice}
            </Link>
            <Link
              href={`/admin/orders/${order.id}/packing-slip` as Route}
              className={buttonClasses('subtle', 'sm')}
              target="_blank"
            >
              <Printer className="size-4" aria-hidden="true" />
              {d.packingSlip}
            </Link>
          </>
        }
      />

      {attention ? (
        <p className="flex items-center gap-2 border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {interpolate(d.attention, { reason: attention })}
        </p>
      ) : null}

      <Card title={t.actions.title}>
        <OrderActions
          locale={locale}
          orderId={order.id}
          actions={order.actions}
          isCod={order.paymentMethod === 'COD'}
          payments={order.payments}
          simulatedShipping={env().SHIPPING_PROVIDER === 'mock'}
          canManage={canManage}
          canRefund={canRefund}
          t={t.actions}
          paymentMethodNames={dict.paymentMethodNames}
          fieldMessages={dict.errors.fields}
          genericError={dict.errors.generic}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title={d.items} bodyClassName="p-0">
            <DataTable
              caption={d.items}
              isEmpty={order.items.length === 0}
              empty={d.none}
              head={
                <tr>
                  <Th>{d.items}</Th>
                  <Th>{d.sku}</Th>
                  <Th className="text-end">{d.qty}</Th>
                  <Th className="text-end">{d.unitPrice}</Th>
                  <Th className="text-end">{d.lineTotal}</Th>
                </tr>
              }
            >
              {order.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="relative block aspect-[4/5] w-10 shrink-0 overflow-hidden bg-sand">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : null}
                      </span>
                      <div>
                        {item.productId ? (
                          <Link
                            href={`/admin/products/${item.productId}` as Route}
                            className="text-ink hover:underline"
                          >
                            {ar ? item.nameAr : item.nameEn}
                          </Link>
                        ) : (
                          <p className="text-ink">{ar ? item.nameAr : item.nameEn}</p>
                        )}
                        {(ar ? item.variantNameAr : item.variantNameEn) ? (
                          <p className="text-xs text-muted">
                            {ar ? item.variantNameAr : item.variantNameEn}
                          </p>
                        ) : null}
                        {item.returnedQuantity > 0 ? (
                          <Badge tone="accent" className="mt-1">
                            {interpolate(d.returned, {
                              count: formatNumber(item.returnedQuantity, locale),
                            })}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </Td>
                  <Td className="ltr-nums text-xs text-muted">{item.sku}</Td>
                  <Td className="text-end tabular-nums">{formatNumber(item.quantity, locale)}</Td>
                  <Td className="ltr-nums text-end tabular-nums">{money(item.unitPrice)}</Td>
                  <Td className="ltr-nums text-end tabular-nums">{money(item.lineTotal)}</Td>
                </tr>
              ))}
            </DataTable>
            <dl className="ms-auto max-w-sm space-y-2 p-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{dict.cart.bag.subtotal}</dt>
                <dd className="ltr-nums">{money(order.subtotal)}</dd>
              </div>
              {order.discountTotal > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {interpolate(dict.cart.bag.discount, { code: order.couponCode ?? '' })}
                  </dt>
                  <dd className="ltr-nums">−{money(order.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{dict.checkout.shipping[order.shippingMethod]}</dt>
                <dd className="ltr-nums">
                  {order.shippingTotal === 0
                    ? dict.cart.bag.shippingFree
                    : money(order.shippingTotal)}
                </dd>
              </div>
              {order.codFee > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{dict.cart.bag.codFee}</dt>
                  <dd className="ltr-nums">{money(order.codFee)}</dd>
                </div>
              ) : null}
              {!order.pricesIncludeTax && order.taxTotal > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {interpolate(dict.cart.bag.vat, {
                      rate: formatBasisPoints(order.taxRateBps, locale),
                    })}
                  </dt>
                  <dd className="ltr-nums">{money(order.taxTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium text-ink">
                <dt>{dict.cart.bag.total}</dt>
                <dd className="ltr-nums">{money(order.total)}</dd>
              </div>
              {order.pricesIncludeTax && order.taxTotal > 0 ? (
                <p className="text-xs text-muted">
                  {interpolate(dict.cart.bag.vatIncluded, {
                    rate: formatBasisPoints(order.taxRateBps, locale),
                  })}
                  : <span className="ltr-nums">{money(order.taxTotal)}</span>
                </p>
              ) : null}
            </dl>
          </Card>

          <Card title={d.payments} bodyClassName="p-0">
            <DataTable
              caption={d.payments}
              isEmpty={order.payments.length === 0}
              empty={d.none}
              head={
                <tr>
                  <Th>{dict.admin.orders.columns.payment}</Th>
                  <Th>{d.provider}</Th>
                  <Th className="text-end">{d.amount}</Th>
                  <Th className="text-end">{d.refunded}</Th>
                  <Th className="text-end">{d.refundable}</Th>
                </tr>
              }
            >
              {order.payments.map((payment) => (
                <tr key={payment.id}>
                  <Td>
                    <p>{dict.paymentMethodNames[payment.method]}</p>
                    <Badge tone={PAYMENT_STATUS_TONE[payment.status]}>
                      {dict.orders.paymentStatus[payment.status]}
                    </Badge>
                    {payment.failureMessage ? (
                      <p className="mt-1 text-xs text-danger">{payment.failureMessage}</p>
                    ) : null}
                  </Td>
                  <Td>
                    <p>{payment.provider}</p>
                    {payment.providerPaymentId ? (
                      <p className="ltr-nums text-xs break-all text-muted">
                        {payment.providerPaymentId}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="ltr-nums text-end tabular-nums">{money(payment.amount)}</Td>
                  <Td className="ltr-nums text-end tabular-nums">
                    {money(payment.refundedAmount)}
                  </Td>
                  <Td className="ltr-nums text-end tabular-nums">{money(payment.refundable)}</Td>
                </tr>
              ))}
            </DataTable>
          </Card>

          {order.refunds.length > 0 ? (
            <Card title={d.refunds} bodyClassName="p-0">
              <DataTable
                caption={d.refunds}
                isEmpty={false}
                empty={d.none}
                head={
                  <tr>
                    <Th>{dict.admin.orders.columns.date}</Th>
                    <Th className="text-end">{d.amount}</Th>
                    <Th>{dict.admin.orders.columns.status}</Th>
                    <Th>{d.reference}</Th>
                    <Th>{d.by}</Th>
                  </tr>
                }
              >
                {order.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDateTime(refund.createdAt, locale)}
                      <p className="text-xs text-text">{refund.reason}</p>
                    </Td>
                    <Td className="ltr-nums text-end tabular-nums">{money(refund.amount)}</Td>
                    <Td>
                      <Badge
                        tone={
                          refund.status === 'SUCCEEDED'
                            ? 'success'
                            : refund.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {d.refundStatus[refund.status]}
                      </Badge>
                      {refund.failureMessage ? (
                        <p className="mt-1 text-xs text-danger">{refund.failureMessage}</p>
                      ) : null}
                    </Td>
                    <Td className="ltr-nums text-xs break-all text-muted">
                      {refund.reference ?? '—'}
                    </Td>
                    <Td className="text-muted">{refund.createdBy ?? '—'}</Td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          ) : null}

          <Card title={d.shipments}>
            {order.shipments.length === 0 ? (
              <p className="text-sm text-muted">{d.none}</p>
            ) : (
              <ul className="space-y-5">
                {order.shipments.map((shipment) => (
                  <li key={shipment.id} className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium text-ink">{shipment.carrier}</span>
                      <Badge
                        tone={
                          shipment.status === 'DELIVERED'
                            ? 'success'
                            : shipment.status === 'CANCELLED'
                              ? 'neutral'
                              : 'accent'
                        }
                      >
                        {d.shipmentStatus[shipment.status]}
                      </Badge>
                      {shipment.trackingNumber ? (
                        <span className="ltr-nums text-muted">{shipment.trackingNumber}</span>
                      ) : null}
                      {shipment.trackingUrl ? (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-4"
                        >
                          {d.trackLink}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                    <ol className="space-y-1 border-s border-line ps-4 text-xs text-muted">
                      {shipment.events.map((event, index) => (
                        <li key={index}>
                          {d.shipmentStatus[event.status]} ·{' '}
                          {formatDateTime(event.occurredAt, locale)}
                          {event.description ? ` · ${event.description}` : ''}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title={d.customer}
            actions={
              hasPermission(session.user, 'CUSTOMERS_VIEW') ? (
                <Link
                  href={`/admin/customers/${order.customer.id}` as Route}
                  className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                >
                  {d.viewCustomer}
                </Link>
              ) : null
            }
          >
            <p className="text-sm text-ink">{order.customer.name}</p>
            <p className="text-sm text-muted">{order.customer.email}</p>
            {order.customer.phone ? (
              <p className="ltr-nums text-sm text-muted">
                {formatSaudiMobile(order.customer.phone)}
              </p>
            ) : null}
          </Card>

          <Card title={d.shippingAddress}>
            <address className="space-y-0.5 text-sm text-text not-italic">
              <p className="font-medium text-ink">{order.shipping.name}</p>
              {addressLines(order.shipping, locale).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="ltr-nums">{formatSaudiMobile(order.shipping.phone)}</p>
              {order.shipping.instructions ? (
                <p className="pt-2 text-muted">{order.shipping.instructions}</p>
              ) : null}
            </address>
            <DefinitionList
              className="mt-4 border-t border-line pt-4"
              items={[{ label: d.delivery, value: dict.checkout.shipping[order.shippingMethod] }]}
            />
          </Card>

          {order.customerNote ? (
            <Card title={d.customerNote}>
              <p className="text-sm whitespace-pre-line text-text">{order.customerNote}</p>
            </Card>
          ) : null}

          {order.returns.length > 0 ? (
            <Card title={d.returns}>
              <ul className="space-y-2 text-sm">
                {order.returns.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/returns/${request.id}` as Route}
                      className="ltr-nums text-ink hover:underline"
                    >
                      {request.returnNumber}
                    </Link>
                    <Badge tone={RETURN_STATUS_TONE[request.status]}>
                      {dict.orders.returns.status[request.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={d.timeline}>
            <ol className="space-y-4 border-s border-line ps-5">
              {order.history.map((entry, index) => (
                <li key={index} className="relative text-sm">
                  <span
                    className="absolute -start-[1.45rem] top-1.5 size-2 rounded-full bg-ink"
                    aria-hidden="true"
                  />
                  <p className="font-medium text-ink">{dict.orders.status[entry.toStatus]}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(entry.createdAt, locale)} ·{' '}
                    {entry.actorName ?? d.actors[entry.actorType]}
                  </p>
                  {entry.note ? <p className="mt-1 text-xs text-text">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
