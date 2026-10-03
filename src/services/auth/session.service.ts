import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import type { Permission, RoleKey, UserStatus } from '@/generated/prisma/enums'
import { effectivePermissions } from '@/lib/auth/permissions'
import { generateToken, hashToken } from '@/lib/security/tokens'

/**
 * Server-side sessions.
 *
 * The browser holds a 256-bit random token in an httpOnly cookie; the
 * database stores only HMAC(token) as the session id. Sessions can therefore
 * be revoked instantly (logout, password change, suspension) — unlike
 * stateless JWTs.
 *
 * Expiry is two-tiered: an idle timeout that slides with activity, and an
 * absolute lifetime that never extends. Staff sessions are much shorter.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const SESSION_POLICY: Record<RoleKey, { idleMs: number; absoluteMs: number }> = {
  CUSTOMER: { idleMs: 30 * DAY, absoluteMs: 90 * DAY },
  STAFF: { idleMs: 12 * HOUR, absoluteMs: 7 * DAY },
  ADMIN: { idleMs: 12 * HOUR, absoluteMs: 7 * DAY },
}

/** Activity bookkeeping is written at most this often to avoid a write per request. */
const TOUCH_INTERVAL_MS = 5 * MINUTE

export interface SessionUser {
  id: string
  email: string
  name: string
  phone: string | null
  role: RoleKey
  status: UserStatus
  locale: string
  emailVerified: boolean
  permissions: Permission[]
}

export interface ValidatedSession {
  sessionId: string
  expiresAt: Date
  user: SessionUser
}

export interface CreatedSession {
  token: string
  sessionId: string
  expiresAt: Date
  /** Cookie lifetime: the absolute maximum (the database enforces the idle timeout). */
  cookieMaxAgeSeconds: number
}

export async function createSession(
  user: { id: string; role: RoleKey },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<CreatedSession> {
  const policy = SESSION_POLICY[user.role]
  const token = generateToken()
  const sessionId = hashToken(token)
  const expiresAt = new Date(now.getTime() + policy.idleMs)
  await db.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  })
  return { token, sessionId, expiresAt, cookieMaxAgeSeconds: Math.floor(policy.absoluteMs / 1000) }
}

/**
 * Resolve a raw cookie token to a live session + safe user DTO, or null.
 * Expired sessions and sessions of suspended users are deleted on sight.
 */
export async function validateSessionToken(
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<ValidatedSession | null> {
  if (!token || token.length < 20 || token.length > 200) return null
  const sessionId = hashToken(token)
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          locale: true,
          emailVerifiedAt: true,
          roleRef: { select: { permissions: true } },
        },
      },
    },
  })
  if (!session) return null

  const policy = SESSION_POLICY[session.user.role]
  const idleExpired = session.expiresAt.getTime() <= now.getTime()
  const absoluteExpired = session.createdAt.getTime() + policy.absoluteMs <= now.getTime()
  if (idleExpired || absoluteExpired || session.user.status !== 'ACTIVE') {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }

  let expiresAt = session.expiresAt
  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    const slid = new Date(
      Math.min(now.getTime() + policy.idleMs, session.createdAt.getTime() + policy.absoluteMs),
    )
    // updateMany: a concurrent logout may already have removed the row.
    await prisma.session.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: slid },
    })
    expiresAt = slid
  }

  const { user } = session
  return {
    sessionId: session.id,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      permissions: effectivePermissions(user.role, user.roleRef.permissions),
    },
  }
}

export async function invalidateSessionToken(token: string | undefined | null): Promise<void> {
  if (!token) return
  await prisma.session.deleteMany({ where: { id: hashToken(token) } })
}

/** Revoke every session of a user, optionally keeping the current one. */
export async function invalidateUserSessions(
  userId: string,
  options: { exceptSessionId?: string } = {},
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}) },
  })
  return result.count
}

export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } })
  return result.count
}
