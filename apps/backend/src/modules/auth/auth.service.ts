import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, tenants, users, refreshTokens, customRoles, platformPasswordTickets, passwordResetTokens } from '../../shared/db/index.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { UnauthorizedError, ConflictError, NotFoundError } from '../../shared/errors.ts'
import type { LoginInput, RegisterInput, ForgotPasswordInput, ResetPasswordInput, UpdateProfileInput, PasswordHelpInput, AuthenticatedPasswordHelpInput } from './auth.schema.ts'
import { normalizePermissions, resolveEffectivePermissions } from '../../shared/permissions.ts'
import { getTenantEntitlements } from '../../shared/services/limits.service.ts'

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
    throw new ConflictError('Unable to process registration request', 'REGISTRATION_UNAVAILABLE')
  }

  const password_hash = await bcrypt.hash(input.password, 12)

  const [tenant] = await db.insert(tenants).values({
    name: input.clinic_name,
    slug: input.clinic_slug,
    type: input.tenant_type ?? 'CLINIC',
    settings: { requested_plan: input.selected_plan },
  }).returning()

  const [user] = await db.insert(users).values({
    tenant_id: tenant.id,
    email: input.email,
    password_hash,
    first_name: input.first_name,
    last_name: input.last_name,
    professional_id: input.professional_id,
    colegiado_number: input.colegiado_number,
    specialty: input.specialty,
    dpi_document_key: input.dpi_document_key,
    role: 'ADMIN_CLINIC',
    is_verified: false,
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
    context: input.selected_plan ? { requested_plan: input.selected_plan } : undefined,
  })

  return { user: await sanitizeUser(user), ...tokens }
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

  // SUPER_ADMIN must use the admin portal login, not the doctor portal
  if (user.role === 'SUPER_ADMIN') {
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

  return { user: await sanitizeUser(user), ...tokens }
}

export async function refresh(rawRefreshToken: string, userAgent?: string) {
  const tokenHash = hashToken(rawRefreshToken)

  const stored = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token_hash, tokenHash),
    with: { user: true },
  })

  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  if (stored.is_revoked || stored.used_at) {
    await db.update(refreshTokens)
      .set({ is_revoked: true })
      .where(eq(refreshTokens.user_id, stored.user_id))

    await createAuditLog({
      tenant_id: stored.user.tenant_id,
      actor_id: stored.user.id,
      actor_type: 'USER',
      actor_email: stored.user.email,
      action: 'TOKEN_REVOKED',
      resource_type: 'REFRESH_TOKEN',
      resource_id: stored.id,
      user_agent: userAgent,
      context: { reason: 'REFRESH_TOKEN_REUSE_DETECTED' },
    })

    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  if (stored.expires_at < new Date()) {
    await db.update(refreshTokens)
      .set({ is_revoked: true })
      .where(eq(refreshTokens.id, stored.id))
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  // Rotate: revoke old token, issue new pair
  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.id, stored.id))

  const { user } = stored
  if (!user.is_active) {
    await db.update(refreshTokens)
      .set({ is_revoked: true, used_at: new Date() })
      .where(eq(refreshTokens.id, stored.id))
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

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

export async function logoutByRefresh(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken)
  const stored = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token_hash, tokenHash),
    with: { user: true },
  })
  if (!stored) return

  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.id, stored.id))

  await createAuditLog({
    tenant_id: stored.user.tenant_id,
    actor_id: stored.user.id,
    actor_type: 'USER',
    actor_email: stored.user.email,
    action: 'LOGOUT',
    resource_type: 'USER',
    resource_id: stored.user.id,
    context: { refresh_token_id: stored.id },
  })
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function forgotPassword(input: ForgotPasswordInput) {
  await requestPasswordHelp(input)
}

export async function requestPasswordHelp(input: PasswordHelpInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    columns: { id: true, tenant_id: true, email: true, first_name: true, last_name: true, is_active: true },
  })

  // Always return success to prevent email enumeration.
  if (!user || !user.is_active) return

  await createPasswordHelpTicket({
    user_id: user.id,
    tenant_id: user.tenant_id,
    requester_email: user.email,
    requester_name: `${user.first_name} ${user.last_name}`.trim(),
    source: 'LOGIN_HELP',
    message: input.message,
  })
}

export async function requestAuthenticatedPasswordHelp(userId: string, input: AuthenticatedPasswordHelpInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, tenant_id: true, email: true, first_name: true, last_name: true, is_active: true },
  })

  if (!user || !user.is_active) throw new UnauthorizedError('Account not found', 'ACCOUNT_INACTIVE')

  await createPasswordHelpTicket({
    user_id: user.id,
    tenant_id: user.tenant_id,
    requester_email: user.email,
    requester_name: `${user.first_name} ${user.last_name}`.trim(),
    source: 'AUTHENTICATED_PROFILE',
    message: input.message,
  })
}

async function createPasswordHelpTicket(input: {
  user_id: string
  tenant_id: string
  requester_email: string
  requester_name: string
  source: 'LOGIN_HELP' | 'AUTHENTICATED_PROFILE'
  message?: string
}) {
  const existing = await db.query.platformPasswordTickets.findFirst({
    where: and(
      eq(platformPasswordTickets.user_id, input.user_id),
      eq(platformPasswordTickets.status, 'OPEN'),
    ),
    columns: { id: true },
  }) ?? await db.query.platformPasswordTickets.findFirst({
    where: and(
      eq(platformPasswordTickets.user_id, input.user_id),
      eq(platformPasswordTickets.status, 'IN_REVIEW'),
    ),
    columns: { id: true },
  })

  if (!existing) {
    const [ticket] = await db.insert(platformPasswordTickets).values(input).returning({ id: platformPasswordTickets.id })

    await createAuditLog({
      tenant_id: input.tenant_id,
      actor_id: input.user_id,
      actor_type: 'USER',
      actor_email: input.requester_email,
      action: 'SETTINGS_CHANGED',
      resource_type: 'PLATFORM_PASSWORD_TICKET',
      resource_id: ticket.id,
      context: { action: 'PASSWORD_HELP_REQUESTED', source: input.source },
    })
  }
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenHash = hashToken(input.token)

  const record = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token_hash, tokenHash),
    with: { user: { columns: { id: true, tenant_id: true, email: true, is_active: true } } },
  })

  if (!record) throw new UnauthorizedError('Invalid or expired reset link', 'INVALID_TOKEN')
  if (record.used_at) throw new UnauthorizedError('Invalid or expired reset link', 'INVALID_TOKEN')
  if (record.expires_at < new Date()) throw new UnauthorizedError('Invalid or expired reset link', 'INVALID_TOKEN')
  if (!record.user.is_active) throw new UnauthorizedError('Invalid or expired reset link', 'INVALID_TOKEN')

  const password_hash = await bcrypt.hash(input.password, 12)

  await db.update(users)
    .set({ password_hash, updated_at: new Date() })
    .where(eq(users.id, record.user_id))

  await db.update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(eq(passwordResetTokens.id, record.id))

  await db.update(refreshTokens)
    .set({ is_revoked: true })
    .where(eq(refreshTokens.user_id, record.user_id))

  await createAuditLog({
    tenant_id: record.user.tenant_id,
    actor_id: record.user_id,
    actor_type: 'USER',
    actor_email: record.user.email,
    action: 'SETTINGS_CHANGED',
    resource_type: 'USER',
    resource_id: record.user_id,
    context: { action: 'PASSWORD_RESET_WITH_PLATFORM_TOKEN' },
  })
}

// ─── Profile update ───────────────────────────────────────────────────────────

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const [updated] = await db.update(users)
    .set({ ...input, updated_at: new Date() })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      specialty: users.specialty,
      professional_id: users.professional_id,
      role: users.role,
    })

  if (!updated) throw new NotFoundError('User')
  return updated
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

async function sanitizeUser(user: typeof users.$inferSelect) {
  const safe = Object.fromEntries(
    Object.entries(user).filter(([key]) => key !== 'password_hash' && key !== 'access_pin_hash'),
  ) as Omit<typeof users.$inferSelect, 'password_hash'>
  const [tenant, entitlements] = await Promise.all([
    db.query.tenants.findFirst({
      where: eq(tenants.id, safe.tenant_id),
      columns: { type: true },
    }),
    getTenantEntitlements(safe.tenant_id),
  ])
  const customRole = safe.custom_role_id
    ? await db.query.customRoles.findFirst({
        where: and(eq(customRoles.id, safe.custom_role_id), eq(customRoles.tenant_id, safe.tenant_id), eq(customRoles.is_active, true)),
        columns: { id: true, name: true, description: true, base_role: true, permissions: true },
      })
    : null
  return {
    ...safe,
    tenant_type: tenant?.type ?? 'CLINIC',
    tenant_plan: entitlements.plan,
    tenant_capabilities: entitlements.capabilities,
    custom_role: customRole ? { ...customRole, permissions: normalizePermissions(customRole.permissions) } : null,
    permissions: await resolveEffectivePermissions(safe.tenant_id, safe.role, safe.custom_role_id),
  }
}
