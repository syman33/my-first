import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { ReturnActions } from '@/components/admin/orders/return-actions'
import { AdminPageHeader, Badge, Card, DefinitionList } from '@/components/admin/ui'
import { getDictionary, interpolate } from '@/i18n'
import { formatDateTime, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { RETURN_STATUS_TONE } from '@/lib/admin/status-tones'
import { hasPermission } from '@/lib/auth/permissions'
import { isAppError } from '@/lib/errors'
import type { ReturnReason } from '@/lib/orders/returns'
import { uuidField } from '@/schemas/common'
import { getAdminReturn } from '@/services/admin/returns.service'
import { quoteReturnRefund } from '@/services/orders/returns.service'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.returns.title }
}

export default async function AdminReturnPage({ params }: PageProps<'/admin/returns/[id]'>) {
  const { id } = await params
  const access = await adminAccess('ORDERS_VIEW', `/admin/returns/${id}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  let request
  try {
    request = await getAdminReturn(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const { locale, dict, session } = access
  const t = dict.admin.returns
  const d = t.detail
  const ar = locale === 'ar'
  const canManage = hasPermission(session.user, 'ORDERS_MANAGE')
  const canRefund = hasPermission(session.user, 'ORDERS_REFUND')
  const quote =
    request.status === 'RECEIVED' && canRefund ? await quoteReturnRefund(request.id) : null
  const reason =
    (dict.orders.returns.reasons as Record<ReturnReason, string>)[request.reason as ReturnReason] ??
    request.reason
  const stages = [
    { label: d.requested, at: request.createdAt },
    { label: d.reviewed, at: request.reviewedAt, by: request.reviewedBy },
    { label: d.received, at: request.receivedAt },
    { label: d.completed, at: request.completedAt },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/returns', label: d.back }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="ltr-nums">
              {interpolate(d.title, { number: request.returnNumber })}
            </span>
            <Badge tone={RETURN_STATUS_TONE[request.status]}>
              {dict.orders.returns.status[request.status]}
            </Badge>
          </span>
        }
        description={formatDateTime(request.createdAt, locale)}
      />

      {(request.status === 'REQUESTED' && canManage) ||
      (request.status === 'APPROVED' && canManage) ||
      (request.status === 'RECEIVED' && canRefund) ? (
        <Card title={dict.admin.orders.actions.title}>
          <ReturnActions
            locale={locale}
            returnId={request.id}
            status={request.status}
            items={request.items.map((item) => ({
              id: item.id,
              name: `${ar ? item.nameAr : item.nameEn}${(ar ? item.variantNameAr : item.variantNameEn) ? ` · ${ar ? item.variantNameAr : item.variantNameEn}` : ''}`,
              quantity: item.quantity,
            }))}
            quote={
              quote
                ? {
                    suggested: quote.suggested,
                    refundable: quote.refundable,
                    manual: quote.manual,
                    hasPayment: quote.paymentId !== null,
                  }
                : null
            }
            canManage={canManage}
            canRefund={canRefund}
            t={t}
            fieldMessages={dict.errors.fields}
            genericError={dict.errors.generic}
          />
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title={d.items}>
            <ul className="divide-y divide-line">
              {request.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-4 py-3 text-sm first:pt-0 last:pb-0"
                >
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
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{ar ? item.nameAr : item.nameEn}</p>
                    {(ar ? item.variantNameAr : item.variantNameEn) ? (
                      <p className="text-xs text-muted">
                        {ar ? item.variantNameAr : item.variantNameEn}
                      </p>
                    ) : null}
                    <p className="ltr-nums text-xs text-muted">{item.sku}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-medium tabular-nums">
                      × {formatNumber(item.quantity, locale)}
                    </p>
                    <p className="text-xs text-muted">
                      {interpolate(d.purchased, {
                        count: formatNumber(item.purchasedQuantity, locale),
                      })}
                    </p>
                  </div>
                  {item.condition ? (
                    <div className="w-full sm:w-auto">
                      <Badge tone={item.condition === 'SELLABLE' ? 'success' : 'danger'}>
                        {d.conditions[item.condition]}
                      </Badge>
                      {item.restockedQuantity > 0 ? (
                        <p className="mt-1 text-xs text-muted">
                          {interpolate(d.restocked, {
                            count: formatNumber(item.restockedQuantity, locale),
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          {request.refunds.length > 0 ? (
            <Card title={d.refunds}>
              <ul className="space-y-2 text-sm">
                {request.refunds.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="ltr-nums font-medium">
                      {formatMoney(refund.amount, locale)}
                    </span>
                    <Badge
                      tone={
                        refund.status === 'SUCCEEDED'
                          ? 'success'
                          : refund.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {dict.admin.orders.detail.refundStatus[refund.status]}
                    </Badge>
                    <span className="ltr-nums text-xs break-all text-muted">
                      {refund.reference ?? '—'}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDateTime(refund.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title={d.order}>
            <DefinitionList
              items={[
                {
                  label: d.order,
                  value: (
                    <Link
                      href={`/admin/orders/${request.order.id}` as Route}
                      className="ltr-nums hover:underline"
                    >
                      {request.order.orderNumber}
                    </Link>
                  ),
                },
                {
                  label: dict.admin.orders.columns.payment,
                  value: dict.paymentMethodNames[request.order.paymentMethod],
                },
                { label: d.reason, value: reason },
                { label: d.customer, value: request.customer.name },
                { label: d.email, value: request.customer.email },
                ...(request.customer.phone
                  ? [
                      {
                        label: d.phone,
                        value: (
                          <span className="ltr-nums">
                            {formatSaudiMobile(request.customer.phone)}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
          {request.customerNote ? (
            <Card title={d.customerNote}>
              <p className="text-sm whitespace-pre-line text-text">{request.customerNote}</p>
            </Card>
          ) : null}
          {request.adminNote ? (
            <Card title={d.adminNote}>
              <p className="text-sm whitespace-pre-line text-text">{request.adminNote}</p>
            </Card>
          ) : null}
          <Card title={d.stages}>
            <ol className="space-y-3 text-sm">
              {stages.map((stage) => (
                <li key={stage.label} className="flex justify-between gap-3">
                  <span className={stage.at ? 'text-ink' : 'text-muted'}>{stage.label}</span>
                  <span className="text-xs text-muted">
                    {stage.at ? formatDateTime(stage.at, locale) : '—'}
                    {stage.by ? ` · ${stage.by}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
