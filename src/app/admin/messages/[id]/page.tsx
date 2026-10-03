import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Mail } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { MarkReadOnView } from '@/components/admin/mark-read-on-view'
import { PostAction } from '@/components/admin/post-action'
import { AdminPageHeader, Badge, Card, DefinitionList } from '@/components/admin/ui'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary, interpolate } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getMessage } from '@/services/admin/customers.service'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.messages.title }
}

export default async function AdminMessagePage({ params }: PageProps<'/admin/messages/[id]'>) {
  const { id } = await params
  const access = await adminAccess('MESSAGES_VIEW', `/admin/messages/${id}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  const { locale, dict } = access
  let message
  try {
    message = await getMessage(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const t = dict.admin.messages
  const mailto = `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(interpolate(t.replySubject, { subject: message.subject }))}`

  return (
    <div className="space-y-6">
      {message.status === 'NEW' ? <MarkReadOnView locale={locale} messageId={message.id} /> : null}
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/messages', label: t.back }}
        title={<span dir="auto">{message.subject}</span>}
        description={formatDateTime(message.createdAt, locale)}
        actions={
          <a href={mailto} className={buttonClasses('primary', 'sm')}>
            <Mail className="size-4" aria-hidden="true" />
            {t.reply}
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <p className="text-sm leading-relaxed whitespace-pre-line text-text" dir="auto">
            {message.message}
          </p>
        </Card>
        <div className="space-y-6">
          <Card>
            <DefinitionList
              items={[
                { label: t.columns.from, value: message.name },
                { label: t.email, value: message.email },
                {
                  label: t.phone,
                  value: message.phone ? (
                    <span className="ltr-nums">{formatSaudiMobile(message.phone)}</span>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t.columns.status,
                  value: <Badge tone="neutral">{t.statuses[message.status]}</Badge>,
                },
              ]}
            />
          </Card>
          <div className="flex flex-wrap gap-2">
            {message.status !== 'ARCHIVED' ? (
              <PostAction
                locale={locale}
                endpoint={`/api/admin/messages/${message.id}/status`}
                body={{ status: 'ARCHIVED' }}
                label={t.archive}
                cancelLabel={dict.admin.form.cancel}
                genericError={dict.errors.generic}
              />
            ) : (
              <PostAction
                locale={locale}
                endpoint={`/api/admin/messages/${message.id}/status`}
                body={{ status: 'READ' }}
                label={t.unarchive}
                cancelLabel={dict.admin.form.cancel}
                genericError={dict.errors.generic}
              />
            )}
            {message.status === 'READ' ? (
              <PostAction
                locale={locale}
                endpoint={`/api/admin/messages/${message.id}/status`}
                body={{ status: 'NEW' }}
                label={t.markUnread}
                variant="ghost"
                cancelLabel={dict.admin.form.cancel}
                genericError={dict.errors.generic}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
