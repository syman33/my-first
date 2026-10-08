import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { PostAction } from '@/components/admin/post-action'
import { InviteStaffForm } from '@/components/admin/staff/invite-staff-form'
import { PermissionsEditor } from '@/components/admin/staff/permissions-editor'
import { AdminPageHeader, Badge, Card, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import {
  getStaffRolePermissions,
  isInvitationPending,
  listStaff,
} from '@/services/admin/staff.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.staff.title }
}

export default async function AdminStaffPage() {
  const access = await adminAccess('ADMIN_USERS_MANAGE', '/admin/staff')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict, session } = access
  const t = dict.admin.staff
  const [members, permissions] = await Promise.all([listStaff(), getStaffRolePermissions()])
  const common = { locale, cancelLabel: dict.admin.form.cancel, genericError: dict.errors.generic }

  return (
    <div className="space-y-8">
      <AdminPageHeader title={t.title} description={t.description} />
      <InviteStaffForm
        locale={locale}
        t={t}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
      <DataTable
        caption={t.title}
        isEmpty={members.length === 0}
        empty={dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.member}</Th>
            <Th>{t.columns.role}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.lastLogin}</Th>
            <Th>
              <span className="sr-only">{dict.admin.table.actions}</span>
            </Th>
          </tr>
        }
      >
        {members.map((member) => {
          const self = member.id === session.user.id
          const pending = isInvitationPending(member)
          const endpoint = `/api/admin/staff/${member.id}`
          return (
            <tr key={member.id} className="align-top" data-testid="staff-row">
              <Td>
                <p className="font-medium text-ink">
                  {member.name}
                  {self ? <span className="ms-2 text-xs text-muted">({t.you})</span> : null}
                </p>
                <p className="text-xs text-muted" dir="ltr">
                  {member.email}
                </p>
                <Link
                  href={`/admin/audit?actor=${member.id}` as Route}
                  className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {dict.admin.audit.activity}
                </Link>
              </Td>
              <Td>
                <Badge tone={member.role === 'ADMIN' ? 'accent' : 'neutral'}>
                  {member.role === 'ADMIN' ? t.roles.ADMIN : t.roles.STAFF}
                </Badge>
              </Td>
              <Td>
                <Badge
                  tone={member.status === 'SUSPENDED' ? 'danger' : pending ? 'warning' : 'success'}
                >
                  {member.status === 'SUSPENDED'
                    ? t.statuses.SUSPENDED
                    : pending
                      ? t.statuses.INVITED
                      : t.statuses.ACTIVE}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-muted">
                {member.lastLoginAt ? formatDateTime(member.lastLoginAt, locale) : t.never}
              </Td>
              <Td>
                {self ? (
                  <p className="max-w-56 text-xs text-muted">{t.selfNote}</p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <PostAction
                      {...common}
                      endpoint={endpoint}
                      method="PATCH"
                      body={{ role: member.role === 'ADMIN' ? 'STAFF' : 'ADMIN' }}
                      label={member.role === 'ADMIN' ? t.makeStaff : t.makeAdmin}
                      variant="subtle"
                      confirmText={t.confirmRole}
                    />
                    {member.status === 'ACTIVE' ? (
                      <PostAction
                        {...common}
                        endpoint={endpoint}
                        method="PATCH"
                        body={{ status: 'SUSPENDED' }}
                        label={t.suspend}
                        variant="danger"
                        confirmText={t.confirmSuspend}
                      />
                    ) : (
                      <PostAction
                        {...common}
                        endpoint={endpoint}
                        method="PATCH"
                        body={{ status: 'ACTIVE' }}
                        label={t.reactivate}
                        variant="subtle"
                      />
                    )}
                    {member.status === 'ACTIVE' ? (
                      <PostAction
                        {...common}
                        endpoint={`${endpoint}/password-link`}
                        label={pending ? t.resendInvite : t.sendLink}
                        variant="ghost"
                        doneMessage={t.linkSent}
                      />
                    ) : null}
                  </div>
                )}
              </Td>
            </tr>
          )
        })}
      </DataTable>
      <Card title={t.permissions.title}>
        <p className="mb-6 text-sm text-muted">{t.permissions.description}</p>
        <PermissionsEditor
          locale={locale}
          initial={permissions}
          t={t.permissions}
          groupLabels={dict.admin.nav.groups}
          genericError={dict.errors.generic}
        />
      </Card>
    </div>
  )
}
