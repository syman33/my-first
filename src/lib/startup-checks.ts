import 'server-only'
import { prisma } from '@/db/client'
import { logger } from '@/lib/logger'

/** Domain reserved for development seed accounts (never valid in production). */
export const DEV_ACCOUNT_DOMAIN = 'velora.local'

/**
 * Production/staging safety checks run at startup. Findings are logged at
 * error level for the operator; they are never exposed over HTTP.
 */
export async function reportInsecureProductionState(): Promise<void> {
  try {
    const devAccounts = await prisma.user.count({
      where: { email: { endsWith: `@${DEV_ACCOUNT_DOMAIN}` }, status: 'ACTIVE' },
    })
    if (devAccounts > 0) {
      logger.error('security.dev_accounts_present', {
        count: devAccounts,
        remedy:
          'Suspend or delete @velora.local accounts and create a real administrator with `npm run admin:create`.',
      })
    }
  } catch (error) {
    logger.error('startup.checks_failed', { error })
  }
}
