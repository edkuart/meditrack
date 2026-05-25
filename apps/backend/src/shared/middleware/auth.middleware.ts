import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyAccessToken, type AccessTokenPayload } from '../services/token.service.ts'
import { UnauthorizedError, ForbiddenError } from '../errors.ts'
import type { userRoleEnum } from '../db/schema/users.ts'
import { db, users } from '../db/index.ts'
import { eq } from 'drizzle-orm'
import { resolveEffectivePermissions } from '../permissions.ts'
import { getClinicalAccessCookie } from '../session-cookies.ts'

type UserRole = (typeof userRoleEnum.enumValues)[number]

export interface AuthContext {
  user: AccessTokenPayload
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AccessTokenPayload
    userVerified: boolean
    userRejected: boolean
  }
}

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const adminCookieToken = getCookie(c, 'meditrack_admin_access')
  const clinicalCookieToken = getClinicalAccessCookie(c)
  const token = bearerToken ?? adminCookieToken ?? clinicalCookieToken

  if (!token) {
    throw new UnauthorizedError('Missing or invalid Authorization token')
  }

  try {
    const payload = await verifyAccessToken(token)
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
      columns: {
        id: true,
        tenant_id: true,
        email: true,
        role: true,
        custom_role_id: true,
        is_active: true,
        is_verified: true,
        verification_rejected_at: true,
      },
    })
    if (!user?.is_active) throw new UnauthorizedError('User is inactive')
    const permissions = await resolveEffectivePermissions(user.tenant_id, user.role, user.custom_role_id)
    c.set('auth', {
      ...payload,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
      custom_role_id: user.custom_role_id,
      permissions,
    })
    c.set('userVerified', user.is_verified)
    c.set('userRejected', user.verification_rejected_at !== null)
    await next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}

// Blocks access for doctors whose account is pending admin verification.
// Must run after requireAuth (which sets userVerified/userRejected on context).
// SUPER_ADMIN and ADMIN_CLINIC bypass this check — they are pre-verified.
export async function requireVerified(c: Context, next: Next) {
  const auth = c.get('auth')
  if (!auth) throw new UnauthorizedError()

  if (auth.role === 'SUPER_ADMIN' || auth.role === 'ADMIN_CLINIC') {
    return next()
  }

  if (c.get('userRejected')) {
    throw new ForbiddenError('Your registration was rejected. Contact support.', 'VERIFICATION_REJECTED')
  }

  if (!c.get('userVerified')) {
    throw new ForbiddenError('Your account is pending verification by an administrator.', 'PENDING_VERIFICATION')
  }

  await next()
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth')
    if (!auth) throw new UnauthorizedError()

    if (!roles.includes(auth.role as UserRole)) {
      throw new ForbiddenError(`Role ${auth.role} is not authorized for this action`)
    }

    await next()
  }
}
