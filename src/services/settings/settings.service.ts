import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { type Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'
import {
  type AllSettings,
  parseStoredSettings,
  SETTINGS_GROUPS,
  type SettingsGroup,
  type SettingsOf,
  settingsSchemas,
} from '@/schemas/settings'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'

/**
 * Store settings access. Stored documents are validated on every read and
 * missing keys fall back to schema defaults, so adding a new setting never
 * requires a data migration.
 */

/** Stored settings with invalid keys replaced by defaults; the problem is logged, never fatal. */
function readStoredSettings<G extends SettingsGroup>(group: G, value: unknown): SettingsOf<G> {
  const { settings, invalidKeys } = parseStoredSettings(group, value)
  if (invalidKeys.length > 0) {
    logger.error('settings.invalid_stored_value', { group, keys: invalidKeys })
  }
  return settings
}

export async function getSettings<G extends SettingsGroup>(
  group: G,
  db: DbClient = prisma,
): Promise<SettingsOf<G>> {
  const row = await db.setting.findUnique({ where: { key: group }, select: { value: true } })
  return readStoredSettings(group, row?.value ?? {})
}

export async function getAllSettings(db: DbClient = prisma): Promise<AllSettings> {
  const rows = await db.setting.findMany({ select: { key: true, value: true } })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const out = {} as Record<SettingsGroup, unknown>
  for (const group of SETTINGS_GROUPS) out[group] = readStoredSettings(group, byKey.get(group))
  return out as AllSettings
}

/** Validate and persist a settings group, recording a before/after audit entry. */
export async function updateSettings<G extends SettingsGroup>(
  group: G,
  input: unknown,
  audit: AuditContext,
): Promise<SettingsOf<G>> {
  const schema = settingsSchemas[group]
  const value = schema.parse(input) as SettingsOf<G>
  return prisma.$transaction(async (tx) => {
    const before = await getSettings(group, tx)
    await tx.setting.upsert({
      where: { key: group },
      create: { key: group, value: value as Prisma.InputJsonValue, updatedById: audit.actor.id },
      update: { value: value as Prisma.InputJsonValue, updatedById: audit.actor.id },
    })
    await recordAudit(tx, audit, {
      action: 'settings.updated',
      entityType: 'settings',
      entityId: group,
      metadata: {
        changes: diffFields(before as Record<string, unknown>, value as Record<string, unknown>),
      },
    })
    return value
  })
}
