import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, tenants, users, refreshTokens } from '../../shared/db/index.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { UnauthorizedError, ConflictError, NotFoundError } from '../../shared/errors.ts'
import type { LoginInput, RegisterInput } from './auth.schema.ts'

export async function register(input: RegisterInput) {
  const existingSlug = await db.query.tenants.findFirst({
    where: eq(tenants.slug, input.clinic_slug),
  })
  if (existingSlug) {
    throw new ConflictError('Clinic slug is already taken', 'SLUG_TAKEN')
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  })
  if (existingUser) {
    throw new ConflictError('Email is already registered', 'EMAIL_TAKEN')
  }

  const password_hash = await bcrypt.hash(input.password, 12)

  const [tenant] = await db.insert(tenants).values({
    name: input.clinic_name,
    slug: input.clinic_slug,
  }).returning()

  const [user] = await db.insert(users).values({
    tenant_id: tenant.id,
    email: input.email,
    password_hash,
    first_name: input.first_name,
    last_name: input.last_name,
    professional_id: input.professional_id,
    specialty: input.specialty,
    role: 'DOCTOR',
    is_verified: true,
  }).returning()

  const tokens = await issueTokenPair(user.id, user.tenant_id, user.role, user.email)

  await createAuditLog({
    tenant_id: tenant.id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'USER_INVITED',
    resource_type: 'USER',
    resource_id: user.id,
  })

  return { user: sanitizeUser(user), ...tokens }
}

export async function login(input: LoginInput, ip?: string, userAgent?: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  })

  if (!user || !user.is_active) {
    // Timing-safe: always hash even on not found to prevent user enumeration
    await bcrypt.hash(input.password, 12)
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const passwordValid = await bcrypt.compare(input.password, user.password_hash)

  if (!passwordValid) {
    await createAuditLog({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      actor_type: 'USER',
      actor_email: user.email,
      action: 'LOGIN_FAILURE',
      resource_type: 'USER',
      resource_id: user.id,
      ip_address: ip,
      user_agent: userAgent,
    })
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const tokens = await issueTokenPair(user.id, user.tenant_id, user.role, user.email, userAgent)

  await db.update(users)
    .set({ last_login_at: new Date() })
    .where(eq(users.id, user.id))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'LOGIN_SUCCESS',
    resource_type: 'USER',
    resource_id: user.id,
    ip_address: ip,
    user_agent: userAgent,
  })

  return { user: sanitizeUser(user), ...tokens }
}

export async function refresh(rawRefreshToken: string, userAgent?: string) {
  const tokenHash = hashToken(rawRefreshToken)

  const stored = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token_hash, tokenHash),
    with: { user: true },
  })

  if (!stored || stored.is_revoked || stored.expires_at < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  // Rotate: revoke old token, issue new pair
  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.id, stored.id))

  const { user } = stored
  const tokens = await issueTokenPair(user.id, user.tenant_id, user.role, user.email, userAgent)

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'TOKEN_REFRESH',
    resource_type: 'USER',
    resource_id: user.id,
  })

  return tokens
}

export async function logout(userId: string, rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken)

  await db.update(refreshTokens)
    .set({ is_revoked: true })
    .where(
      and(
        eq(refreshTokens.user_id, userId),
        eq(refreshTokens.token_hash, tokenHash),
      ),
    )

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (user) {
    await createAuditLog({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      actor_type: 'USER',
      actor_email: user.email,
      action: 'LOGOUT',
      resource_type: 'USER',
      resource_id: user.id,
    })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(
  userId: string,
  tenantId: string,
  role: string,
  email: string,
  deviceHint?: string,
) {
  const access_token = await signAccessToken({
    sub: userId,
    tenant_id: tenantId,
    role,
    email,
  })

  const rawRefresh = generateRefreshToken()
  const tokenHash = hashToken(rawRefresh)

  await db.insert(refreshTokens).values({
    user_id: userId,
    token_hash: tokenHash,
    device_hint: deviceHint?.slice(0, 200),
    expires_at: refreshTokenExpiresAt(),
  })

  return { access_token, refresh_token: rawRefresh }
}

function sanitizeUser(user: typeof users.$inferSelect) {
  const { password_hash, access_pin_hash, ...safe } = user as typeof users.$inferSelect & { access_pin_hash?: string }
  return safe
}
