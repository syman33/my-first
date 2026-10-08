import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { ReasonAction } from '@/components/admin/post-action'
import {
  AdminPageHeader,
  Badge,
  Card,
  DataTable,
  DefinitionList,
  Td,
  Th,
} from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ORDER_STATUS_TONE } from '@/lib/admin/status-tones'
import { hasPermission } from '@/lib/auth/permissions'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getCustomer } from '@/services/admin/customers.service'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.customers.title }
}

export default async function AdminCustomerPage({ params }: PageProps<'/admin/customers/[id]'>) {
  const { id } = await params
  const access = await adminAccess('CUSTOMERS_VIEW', `/admin/customers/${id}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  let customer
  try {
    customer = await getCustomer(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const { locale, dict, session } = access
  const t = dict.admin.customers
  const canManage = hasPermission(session.user, 'CUSTOMERS_MANAGE')
  const canOrders = hasPermission(session.user, 'ORDERS_VIEW')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/customers', label: t.back }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'danger'}>
              {t.statuses[customer.status]}
            </Badge>
          </span>
        }
        description={customer.email}
      />
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: t.stats.orders, value: formatNumber(customer.paidOrders, locale) },
          { label: t.stats.spent, value: formatMoney(customer.lifetimeValue, locale) },
          { label: t.stats.returns, value: formatNumber(customer._count.returnRequests, locale) },
          { label: t.stats.reviews, value: formatNumber(customer._count.reviews, locale) },
          {
            label: t.stats.newsletter,
            value: customer.newsletter === 'SUBSCRIBED' ? t.subscribed : t.notSubscribed,
          },
        ].map((stat) => (
          <div key={stat.label} className="border border-line bg-paper p-4">
            <p className="text-xs text-muted">{stat.label}</p>
            <p className="ltr-nums mt-1 text-lg font-medium text-ink">{stat.value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {canOrders ? (
            <Card title={t.orders} bodyClassName="p-0">
              <DataTable
                caption={t.orders}
                isEmpty={customer.orders.length === 0}
                empty={dict.admin.table.empty}
                head={
                  <tr>
                    <Th>{dict.admin.orders.columns.order}</Th>
                    <Th>{dict.admin.orders.columns.date}</Th>
                    <Th className="text-end">{dict.admin.orders.columns.total}</Th>
                    <Th>{dict.admin.orders.columns.status}</Th>
                  </tr>
                }
              >
                {customer.orders.map((order) => (
                  <tr key={order.id}>
                    <Td>
                      <Link
                        href={`/admin/orders/${order.id}` as Route}
                        className="ltr-nums text-ink hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDateTime(order.createdAt, locale)}
                    </Td>
                    <Td className="ltr-nums text-end tabular-nums">
                      {formatMoney(order.total, locale)}
                    </Td>
                    <Td>
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {dict.orders.status[order.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          ) : null}
          <Card title={t.addresses}>
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-muted">{dict.admin.orders.detail.none}</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {customer.addresses.map((address) => (
                  <li key={address.id} className="border border-line p-4 text-sm">
                    <p className="font-medium text-ink">{address.fullName}</p>
                    {addressLines(address, locale).map((line) => (
                      <p key={line} className="text-text">
                        {line}
                      </p>
                    ))}
                    <p className="ltr-nums text-muted">{formatSaudiMobile(address.phone)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={t.profile}>
            <DefinitionList
              items={[
                { label: dict.admin.messages.email, value: customer.email },
                {
                  label: dict.admin.messages.phone,
                  value: customer.phone ? (
                    <span className="ltr-nums">{formatSaudiMobile(customer.phone)}</span>
                  ) : (
                    '—'
                  ),
                },
                { label: t.language, value: customer.locale === 'ar' ? 'العربية' : 'English' },
                { label: t.joined, value: formatDate(customer.createdAt, locale) },
                {
                  label: t.lastLogin,
                  value: customer.lastLoginAt
                    ? formatDateTime(customer.lastLoginAt, locale)
                    : t.never,
                },
                {
                  label: t.emailStatus,
                  value: customer.emailVerifiedAt ? t.verified : t.unverified,
                },
              ]}
            />
          </Card>
          {canManage ? (
            <Card title={t.account}>
              {customer.status === 'ACTIVE' ? (
                <ReasonAction
                  locale={locale}
                  endpoint={`/api/admin/customers/${customer.id}/status`}
                  body={{ status: 'SUSPENDED' }}
                  label={t.suspend}
                  reasonLabel={t.reason}
                  hint={t.suspendHint}
                  variant="danger"
                  tooShort={dict.errors.fields.tooShort}
                  genericError={dict.errors.generic}
                  cancelLabel={dict.admin.form.cancel}
                />
              ) : (
                <ReasonAction
                  locale={locale}
                  endpoint={`/api/admin/customers/${customer.id}/status`}
                  body={{ status: 'ACTIVE' }}
                  label={t.reactivate}
                  reasonLabel={t.reason}
                  tooShort={dict.errors.fields.tooShort}
                  genericError={dict.errors.generic}
                  cancelLabel={dict.admin.form.cancel}
                />
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
