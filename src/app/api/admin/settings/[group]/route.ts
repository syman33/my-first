import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { SETTINGS_GROUPS, type SettingsGroup, settingsSchemas } from '@/schemas/settings'
import { updateSettings } from '@/services/settings/settings.service'

function isSettingsGroup(value: string | undefined): value is SettingsGroup {
  return SETTINGS_GROUPS.includes(value as SettingsGroup)
}

/** Replace one settings group (validated in full; audited with a before/after diff). */
export const PUT = apiHandler<{ group: string }>(
  { auth: 'staff', permission: 'SETTINGS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const group = ctx.params.group
    if (!isSettingsGroup(group)) throw new NotFoundError()
    const input = await ctx.body(settingsSchemas[group])
    return ok({ settings: await updateSettings(group, input, ctx.audit) })
  },
)
