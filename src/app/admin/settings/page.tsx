import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { SettingsForm } from '@/components/admin/settings/settings-form'
import { AdminPageHeader, Badge, Card, DataTable, Td, Th } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { settingsToFormValues } from '@/lib/admin/settings-fields'
import type { BadgeTone } from '@/lib/admin/status-tones'
import { SETTINGS_GROUPS, type SettingsGroup } from '@/schemas/settings'
import { getIntegrationStatus, type IntegrationState } from '@/services/admin/system.service'
import { getSettings } from '@/services/settings/settings.service'
import { cn } from '@/utils/cn'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.settings.title }
}

const SECTIONS = [...SETTINGS_GROUPS, 'integrations'] as const
type Section = SettingsGroup | 'integrations'

const STATE_TONES: Record<IntegrationState, BadgeTone> = {
  live: 'success',
  simulated: 'warning',
  local: 'info',
  off: 'neutral',
}

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as readonly string[]).includes(value)
}

export default async function AdminSettingsPage({ searchParams }: PageProps<'/admin/settings'>) {
  const access = await adminAccess('SETTINGS_MANAGE', '/admin/settings')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.settings
  const requested = (await searchParams).group
  const section: Section = isSection(requested) ? requested : 'store'

  let body
  if (section === 'integrations') {
    const integrations = getIntegrationStatus()
    body = (
      <div className="space-y-4">
        {integrations.some((integration) => integration.state === 'simulated') ? (
          <Alert tone="warning">{t.integrations.simulatedNote}</Alert>
        ) : null}
        <DataTable
          caption={t.groups.integrations}
          isEmpty={false}
          empty={null}
          head={
            <tr>
              <Th>{t.integrations.columns.service}</Th>
              <Th>{t.integrations.columns.provider}</Th>
              <Th>{t.integrations.columns.status}</Th>
            </tr>
          }
        >
          {integrations.map((integration) => (
            <tr key={integration.key}>
              <Td className="font-medium text-ink">{t.integrations.services[integration.key]}</Td>
              <Td>
                <code dir="ltr" className="text-xs text-muted">
                  {integration.provider}
                </code>
              </Td>
              <Td>
                <Badge tone={STATE_TONES[integration.state]}>
                  {t.integrations.states[integration.state]}
                </Badge>
              </Td>
            </tr>
          ))}
        </DataTable>
      </div>
    )
  } else {
    const document = await getSettings(section)
    body = (
      <SettingsForm
        key={section}
        locale={locale}
        group={section}
        initial={settingsToFormValues(section, document)}
        labels={t.fields[section]}
        hints={t.hints[section]}
        optionLabels={
          section === 'checkout'
            ? dict.orders.status
            : section === 'payments'
              ? dict.paymentMethodNames
              : {}
        }
        savedLabel={t.saved}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    )
  }

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t.sectionsLabel} className="lg:sticky lg:top-6 lg:self-start">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:flex-col lg:pb-0">
            {SECTIONS.map((key) => (
              <li key={key} className="shrink-0">
                <Link
                  href={`/admin/settings?group=${key}` as Route}
                  aria-current={key === section ? 'page' : undefined}
                  className={cn(
                    'block px-3 py-2 text-sm whitespace-nowrap transition-colors',
                    key === section ? 'bg-ink text-paper' : 'text-text hover:bg-sand',
                  )}
                >
                  {t.groups[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Card title={t.groups[section]}>
          <p className="mb-6 text-sm text-muted">{t.groupDescriptions[section]}</p>
          {body}
        </Card>
      </div>
    </div>
  )
}
