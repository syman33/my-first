import 'server-only'
import { prisma } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { RoleKey } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import {
  burnPasswordVerification,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors'
import { logger } from '@/lib/logger'
import { generateToken, hashToken, sealSecret } from '@/lib/security/tokens'
import { DEV_ACCOUNT_DOMAIN, isProductionLike } from '@/lib/startup-checks'
import { addHours } from '@/utils/time'
import { enqueueEvent } from '@/services/events/outbox.service'
import { invalidateUserSessions } from './session.service'

/**
 * Account lifecycle: registration, credential verification, email
 * verification, password reset and password change. Cookies and rate limits
 * are handled by the HTTP layer; this module holds the business rules.
 */

const EMAIL_VERIFICATION_TTL_HOURS = 24
const PASSWORD_RESET_TTL_HOURS = 1

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: RoleKey
  locale: Locale
}

/**
 * Absolute link for emails. One-time tokens travel in the URL fragment
 * (`#token=…`): browsers never send fragments to servers, so tokens stay out
 * of access logs, proxies and Referer headers. The page reads the fragment
 * and POSTs the token.
 */
function appUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${path}`
}

function toLocale(value: string): Locale {
  return value === 'en' ? 'en' : 'ar'
}

class InvalidTokenError extends AppError {
  constructor() {
    super('INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired token', { status: 400 })
  }
}

// ---------------------------------------------------------------- Registration

export async function registerCustomer(input: {
  name: string
  email: string
  phone: string | null
  password: string
  locale: Locale
}): Promise<AuthenticatedUser> {
  const problem = checkPasswordPolicy(input.password, { email: input.email })
  if (problem) throw new ValidationError({ password: problem })

  const passwordHash = await hashPassword(input.password)
  const verificationToken = generateToken()
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: 'CUSTOMER',
          locale: input.locale,
          lastLoginAt: new Date(),
        },
        select: { id: true, email: true, name: true, role: true, locale: true },
      })
      await tx.verificationToken.create({
        data: {
          userId: user.id,
          purpose: 'EMAIL_VERIFICATION',
          tokenHash: hashToken(verificationToken),
          expiresAt: addHours(new Date(), EMAIL_VERIFICATION_TTL_HOURS),
        },
      })
      await enqueueEvent(tx, {
        type: 'USER_REGISTERED',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { userId: user.id, locale: input.locale },
      })
      await enqueueEvent(tx, {
        type: 'EMAIL_VERIFICATION_REQUESTED',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: {
          userId: user.id,
          locale: input.locale,
          sealedVerifyUrl: sealSecret(
            appUrl(`/${input.locale}/verify-email#token=${verificationToken}`),
          ),
        },
      })
      return { ...user, locale: toLocale(user.locale) }
    })
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'Email already registered')
    throw error
  }
}

// ---------------------------------------------------------------- Login

/**
 * Verify credentials. Unknown emails and wrong passwords produce the same
 * error after a comparable amount of work, so neither the response nor its
 * timing reveals which emails have accounts.
 */
export async function authenticate(email: string, password: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      locale: true,
      passwordHash: true,
    },
  })
  if (!user) {
    await burnPasswordVerification(password)
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
  }
  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

  if (isProductionLike() && user.email.toLowerCase().endsWith(`@${DEV_ACCOUNT_DOMAIN}`)) {
    logger.error('security.dev_account_login_blocked', { userId: user.id })
    throw new ForbiddenError(
      'Development accounts are disabled in this environment',
      'ACCOUNT_DISABLED',
    )
  }
  if (user.status !== 'ACTIVE') throw new ForbiddenError('Account suspended', 'ACCOUNT_DISABLED')

  const upgradedHash = needsRehash(user.passwordHash) ? await hashPassword(password) : undefined
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(upgradedHash ? { passwordHash: upgradedHash } : {}) },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: toLocale(user.locale),
  }
}

// ---------------------------------------------------------------- Password reset

/** Always resolves the same way, whether or not the email exists. */
export async function requestPasswordReset(email: string, locale: Locale): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  })
  if (!user || user.status !== 'ACTIVE') return
  const token = generateToken()
  await prisma.$transaction(async (tx) => {
    // Only the newest link works: older unused reset links are invalidated.
    await tx.verificationToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hashToken(token),
        expiresAt: addHours(new Date(), PASSWORD_RESET_TTL_HOURS),
      },
    })
    await enqueueEvent(tx, {
      type: 'PASSWORD_RESET_REQUESTED',
      aggregateType: 'user',
      aggregateId: user.id,
      payload: {
        userId: user.id,
        locale,
        sealedResetUrl: sealSecret(appUrl(`/${locale}/reset-password#token=${token}`)),
      },
    })
  })
}

async function consumeToken(token: string, purpose: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION') {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      purpose: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { id: true, email: true, status: true, locale: true } },
    },
  })
  if (
    !record ||
    record.purpose !== purpose ||
    record.usedAt ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvalidTokenError()
  }
  return record
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ userId: string }> {
  const record = await consumeToken(token, 'PASSWORD_RESET')
  if (record.user.status !== 'ACTIVE') throw new InvalidTokenError()
  const problem = checkPasswordPolicy(newPassword, { email: record.user.email })
  if (problem) throw new ValidationError({ password: problem })
  const passwordHash = await hashPassword(newPassword)

  await prisma.$transaction(async (tx) => {
    // Single use even under concurrent submissions: only one update can flip usedAt.
    const claimed = await tx.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (claimed.count !== 1) throw new InvalidTokenError()
    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    })
    await invalidateUserSessions(record.user.id, {}, tx)
    await enqueueEvent(tx, {
      type: 'PASSWORD_CHANGED',
      aggregateType: 'user',
      aggregateId: record.user.id,
      payload: { userId: record.user.id, locale: toLocale(record.user.locale) },
    })
  })
  return { userId: record.user.id }
}

// ---------------------------------------------------------------- Email verification

export async function verifyEmail(token: string): Promise<{ userId: string }> {
  const record = await consumeToken(token, 'EMAIL_VERIFICATION')
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (claimed.count !== 1) throw new InvalidTokenError()
    await tx.user.update({ where: { id: record.user.id }, data: { emailVerifiedAt: new Date() } })
  })
  return { userId: record.user.id }
}

export async function resendEmailVerification(
  userId: string,
  locale: Locale,
): Promise<{ alreadyVerified: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  })
  if (!user) throw new UnauthorizedError()
  if (user.emailVerifiedAt) return { alreadyVerified: true }
  const token = generateToken()
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.updateMany({
      where: { userId, purpose: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.verificationToken.create({
      data: {
        userId,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(token),
        expiresAt: addHours(new Date(), EMAIL_VERIFICATION_TTL_HOURS),
      },
    })
    await enqueueEvent(tx, {
      type: 'EMAIL_VERIFICATION_REQUESTED',
      aggregateType: 'user',
      aggregateId: userId,
      payload: {
        userId,
        locale,
        sealedVerifyUrl: sealSecret(appUrl(`/${locale}/verify-email#token=${token}`)),
      },
    })
  })
  return { alreadyVerified: false }
}

// ---------------------------------------------------------------- Account security

export async function changePassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
  keepSessionId: string
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, passwordHash: true, locale: true },
  })
  if (!user) throw new UnauthorizedError()
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError('CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect', {
      status: 422,
      fieldErrors: { currentPassword: 'invalid' },
    })
  }
  const problem = checkPasswordPolicy(input.newPassword, { email: user.email })
  if (problem) throw new ValidationError({ newPassword: problem })
  const passwordHash = await hashPassword(input.newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    })
    await invalidateUserSessions(user.id, { exceptSessionId: input.keepSessionId }, tx)
    await enqueueEvent(tx, {
      type: 'PASSWORD_CHANGED',
      aggregateType: 'user',
      aggregateId: user.id,
      payload: { userId: user.id, locale: toLocale(user.locale) },
    })
  })
}

export async function updateProfile(
  userId: string,
  input: { name: string; phone: string | null; locale: Locale },
) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name, phone: input.phone, locale: input.locale },
    select: { id: true, name: true, email: true, phone: true, locale: true },
  })
}
