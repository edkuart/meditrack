import type { Context, Next } from 'hono'
import { verifyAccessToken, type AccessTokenPayload } from '../services/token.service.ts'
import { UnauthorizedError, ForbiddenError } from '../errors.ts'
import type { userRoleEnum } from '../db/schema/users.ts'

type UserRole = (typeof userRoleEnum.enumValues)[number]

export interface AuthContext {
  user: AccessTokenPayload
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AccessTokenPayload
  }
}

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verifyAccessToken(token)
    c.set('auth', payload)
    await next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
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
