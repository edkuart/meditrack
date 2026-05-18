import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, tenants, users, refreshTokens } from '../../shared/db/index.ts'
import { passwordResetTokens } from '../../shared/db/schema/password-reset-tokens.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
  generateOpaqueToken,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { UnauthorizedError, ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { LoginInput, RegisterInput, ForgotPasswordInput, ResetPasswordInput, UpdateProfileInput, ChangePasswordInput } from './auth.schema.ts'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const RESET_EXPIRES_MINUTES = 30

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
    type: input.tenant_type ?? 'CLINIC',
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

  return { user: sanitizeUser(user), ...tokens }
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

// ─── Password reset ───────────────────────────────────────────────────────────

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    columns: { id: true, email: true, first_name: true, is_active: true },
  })

  // Always return success to prevent email enumeration
  if (!user || !user.is_active) return

  const rawToken = generateOpaqueToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_MINUTES * 60 * 1000)

  // Invalidate any previous unused tokens
  await db.update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(and(eq(passwordResetTokens.user_id, user.id), eq(passwordResetTokens.used_at, null as unknown as Date)))

  await db.insert(passwordResetTokens).values({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`

  sendEmail({
    to: user.email,
    subject: 'Restablecer contraseña — meditrack',
    html: resetEmailHtml(user.first_name, resetUrl, RESET_EXPIRES_MINUTES),
    text: `Hola ${user.first_name},\n\nUsa este enlace para restablecer tu contraseña: ${resetUrl}\n\nExpira en ${RESET_EXPIRES_MINUTES} minutos. Si no solicitaste esto, ignora este correo.`,
  }).catch(err => console.error('[auth] reset email failed:', err))
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenHash = hashToken(input.token)

  const record = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token_hash, tokenHash),
    with: { user: { columns: { id: true, tenant_id: true, email: true, is_active: true } } },
  })

  if (!record) throw new UnauthorizedError('Invalid or expired reset link', 'INVALID_TOKEN')
  if (record.used_at) throw new UnauthorizedError('This reset link has already been used', 'TOKEN_USED')
  if (record.expires_at < new Date()) throw new UnauthorizedError('This reset link has expired', 'TOKEN_EXPIRED')
  if (!record.user.is_active) throw new UnauthorizedError('Account is inactive', 'ACCOUNT_INACTIVE')

  const password_hash = await bcrypt.hash(input.password, 12)

  await db.update(users)
    .set({ password_hash, updated_at: new Date() })
    .where(eq(users.id, record.user_id))

  await db.update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(eq(passwordResetTokens.id, record.id))

  // Revoke all sessions
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
    context: { action: 'PASSWORD_RESET' },
  })
}

// ─── Change password (authenticated) ─────────────────────────────────────────

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, tenant_id: true, email: true, password_hash: true, is_active: true },
  })

  if (!user || !user.is_active) throw new UnauthorizedError('Account not found', 'ACCOUNT_INACTIVE')

  const valid = await bcrypt.compare(input.current_password, user.password_hash)
  if (!valid) throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS')

  const password_hash = await bcrypt.hash(input.new_password, 12)

  await db.update(users)
    .set({ password_hash, updated_at: new Date() })
    .where(eq(users.id, userId))

  // Revoke all refresh tokens so other sessions are signed out
  await db.update(refreshTokens)
    .set({ is_revoked: true })
    .where(eq(refreshTokens.user_id, userId))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'SETTINGS_CHANGED',
    resource_type: 'USER',
    resource_id: user.id,
    context: { action: 'PASSWORD_CHANGE' },
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

function resetEmailHtml(firstName: string, url: string, minutes: number): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">meditrack</p>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px">Restablecer contraseña</h2>
      <p style="margin:0 0 24px;color:#475569">Hola <strong>${firstName}</strong>, recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
          Restablecer contraseña →
        </a>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8">Este enlace expira en <strong>${minutes} minutos</strong>. Si no solicitaste esto, ignora este correo — tu cuenta está segura.</p>
    </div>
  </div>
</body></html>`
}

function sanitizeUser(user: typeof users.$inferSelect) {
  const { password_hash, access_pin_hash, ...safe } = user as typeof users.$inferSelect & { access_pin_hash?: string }
  return safe
}
