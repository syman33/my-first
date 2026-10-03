/**
 * Create the store's administrator (or take over an existing account):
 *
 *   npm run admin:create -- --email owner@example.com --name "Store Owner"
 *   npm run admin:create -- --email owner@example.com --name "Store Owner" --reset
 *   npm run admin:create -- --suspend-dev-accounts
 *
 * The password is typed at a hidden prompt (twice). For unattended
 * provisioning it may come from the ADMIN_PASSWORD environment variable
 * instead; it is never accepted as a command-line argument (shell history,
 * process lists). Nothing secret is printed.
 */
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'
import type * as NextEnv from '@next/env'

// @next/env is a CommonJS bundle whose named exports Node's ESM loader cannot detect.
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof NextEnv

loadEnvConfig(process.cwd())

/** A problem with what the operator typed (reported without a stack trace). */
class InputError extends Error {}

const USAGE = `Usage:
  npm run admin:create -- --email <email> --name <name> [--reset] [--suspend-dev-accounts]
  npm run admin:create -- --suspend-dev-accounts`

async function promptHidden(question: string): Promise<string> {
  // Muted output: what is typed is not echoed to the terminal.
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  process.stdout.write(question)
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true })
  const answer = await new Promise<string>((resolve) => rl.question('', resolve))
  rl.close()
  process.stdout.write('\n')
  return answer
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD
  if (fromEnv) return fromEnv
  if (!process.stdin.isTTY) {
    throw new InputError(
      'No terminal to prompt for the password: set ADMIN_PASSWORD for unattended runs.',
    )
  }
  const first = await promptHidden('New administrator password: ')
  const second = await promptHidden('Repeat the password: ')
  if (first !== second) throw new InputError('The passwords do not match.')
  return first
}

async function main(): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        reset: { type: 'boolean', default: false },
        'suspend-dev-accounts': { type: 'boolean', default: false },
      },
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(USAGE)
    return 2
  }
  const { email, name, reset } = parsed.values
  const suspendDev = parsed.values['suspend-dev-accounts']
  if ((!email || !name) && !suspendDev) {
    console.error(USAGE)
    return 2
  }

  const { isProductionLike } = await import('../../src/lib/startup-checks')
  const provisioning = await import('../../src/services/admin/provision.service')
  const { prisma } = await import('../../src/db/client')
  try {
    if (email && name) {
      const password = await readPassword()
      const result = await provisioning.provisionAdministrator({
        email,
        name,
        password,
        reset: reset ?? false,
        productionLike: isProductionLike(),
      })
      console.log(
        result.outcome === 'created'
          ? `Administrator created: ${email}`
          : `Existing account is now an active administrator with the new password: ${email}`,
      )
    }
    if (suspendDev) {
      const count = await provisioning.suspendDevelopmentAccounts()
      console.log(`Development accounts suspended: ${count}`)
    } else if (isProductionLike()) {
      console.log('Reminder: run with --suspend-dev-accounts to retire any @velora.local accounts.')
    }
    return 0
  } catch (error) {
    if (error instanceof provisioning.ProvisioningError || error instanceof InputError) {
      console.error(error.message)
      return 1
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
