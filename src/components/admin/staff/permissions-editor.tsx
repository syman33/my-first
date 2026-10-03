'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'
import type { Permission } from '@/generated/prisma/enums'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import {
  dependentPermissions,
  PERMISSION_GROUPS,
  withRequiredPermissions,
} from '@/lib/admin/permission-groups'
import { isGrantableToStaff } from '@/lib/auth/permissions'
import { ApiClientError, apiRequest } from '@/lib/client/api'

export function PermissionsEditor({
  locale,
  initial,
  t,
  groupLabels,
  genericError,
}: {
  locale: Locale
  initial: Permission[]
  t: Dictionary['admin']['staff']['permissions']
  groupLabels: Dictionary['admin']['nav']['groups']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<ReadonlySet<Permission>>(() => new Set(initial))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const changed =
    selected.size !== initial.length || initial.some((permission) => !selected.has(permission))

  function toggle(permission: Permission, checked: boolean) {
    setStatus(null)
    setSelected((current) => {
      const next = new Set(current)
      if (checked) {
        for (const granted of withRequiredPermissions([permission])) next.add(granted)
      } else {
        next.delete(permission)
        for (const dependent of dependentPermissions(permission)) next.delete(dependent)
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const result = await apiRequest<{ permissions: Permission[] }>('/api/admin/roles/staff', {
        method: 'PUT',
        body: { permissions: [...selected] },
        locale,
      })
      setSelected(new Set(result.permissions))
      setStatus({ tone: 'success', text: t.saved })
      startTransition(() => router.refresh())
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof ApiClientError ? error.message : genericError,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="staff-permissions">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.key} className="space-y-3">
            <legend className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
              {groupLabels[group.key]}
            </legend>
            {group.permissions.map((permission) => {
              const grantable = isGrantableToStaff(permission)
              return (
                <Checkbox
                  key={permission}
                  label={
                    <>
                      {t.labels[permission]}
                      {grantable ? null : (
                        <span className="ms-2 text-xs text-muted">({t.adminOnly})</span>
                      )}
                    </>
                  }
                  checked={grantable && selected.has(permission)}
                  disabled={!grantable || saving}
                  onChange={(event) => toggle(permission, event.target.checked)}
                />
              )
            })}
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-muted">{t.requiresNote}</p>
      <Button
        onClick={() => void save()}
        loading={saving}
        disabled={!changed}
        data-testid="staff-permissions-save"
      >
        {t.save}
      </Button>
    </div>
  )
}
