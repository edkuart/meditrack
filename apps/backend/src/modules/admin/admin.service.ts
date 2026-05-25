import { eq, and, isNull, isNotNull, count, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, users, tenants, refreshTokens, platformPasswordTickets, passwordResetTokens, auditLogs } from '../../shared/db/index.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
  generateOpaqueToken,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../shared/errors.ts'
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUrl,
  signAdminMfaToken,
  verifyAdminMfaToken,
  verifyTotp,
} from '../../shared/services/mfa.service.ts'
import type {
  AdminLoginInput,
  AdminMfaVerifyInput,
  RejectDoctorInput,
  ListUsersQueryInput,
  ListTenantsQueryInput,
  ListPasswordTicketsQueryInput,
  ListAdminAuditLogsQueryInput,
  UpdateTenantInput,
  UpdatePasswordTicketInput,
} from './admin.schema.ts'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const SUPPORT_RESET_EXPIRES_MINUTES = 30

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function adminLogin(input: AdminLoginInput, ip?: string, userAgent?: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  })

  // Timing-safe: always hash even on not found
  if (!user || !user.is_active) {
    await bcrypt.hash(input.password, 12)
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  // Only SUPER_ADMIN can use this endpoint
  if (user.role !== 'SUPER_ADMIN') {
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

  const mfaToken = await signAdminMfaToken({ sub: user.id, email: user.email })
  const needsSetup = !user.two_fa_enabled || !user.two_fa_secret_encrypted

  if (needsSetup) {
    const secret = generateTotpSecret()
    await db.update(users)
      .set({
        two_fa_secret_encrypted: encryptSecret(secret),
        two_fa_enabled: false,
        two_fa_confirmed_at: null,
        updated_at: new Date(),
      })
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
      context: { action: 'ADMIN_MFA_SETUP_REQUIRED' },
    })

    return {
      mfa_required: true as const,
      mfa_setup_required: true as const,
      mfa_token: mfaToken,
      totp_secret: secret,
      otpauth_url: otpauthUrl(user.email, secret),
      user: sanitizeAdminUser(user),
    }
  }

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
    context: { action: 'ADMIN_PASSWORD_VERIFIED_MFA_REQUIRED' },
  })

  return {
    mfa_required: true as const,
    mfa_setup_required: false as const,
    mfa_token: mfaToken,
    user: sanitizeAdminUser(user),
  }
}

export async function verifyAdminMfa(input: AdminMfaVerifyInput, userAgent?: string) {
  let payload
  try {
    payload = await verifyAdminMfaToken(input.mfa_token)
  } catch {
    throw new UnauthorizedError('Invalid or expired MFA session', 'INVALID_MFA_TOKEN')
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
  })
  if (!user || !user.is_active || user.role !== 'SUPER_ADMIN' || !user.two_fa_secret_encrypted) {
    throw new UnauthorizedError('Invalid or expired MFA session', 'INVALID_MFA_TOKEN')
  }

  const secret = decryptSecret(user.two_fa_secret_encrypted)
  if (!verifyTotp(input.code, secret)) {
    await createAuditLog({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      actor_type: 'USER',
      actor_email: user.email,
      action: 'LOGIN_FAILURE',
      resource_type: 'USER',
      resource_id: user.id,
      user_agent: userAgent,
      context: { action: 'ADMIN_MFA_FAILURE' },
    })
    throw new UnauthorizedError('Invalid MFA code', 'INVALID_MFA_CODE')
  }

  if (!user.two_fa_enabled) {
    await db.update(users)
      .set({ two_fa_enabled: true, two_fa_confirmed_at: new Date(), updated_at: new Date() })
      .where(eq(users.id, user.id))
  }

  const tokens = await issueAdminTokenPair(user, userAgent)

  await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'LOGIN_SUCCESS',
    resource_type: 'USER',
    resource_id: user.id,
    user_agent: userAgent,
    context: { action: 'ADMIN_MFA_SUCCESS' },
  })

  return { user: sanitizeAdminUser({ ...user, two_fa_enabled: true }), ...tokens }
}

export async function refreshAdminSession(rawRefreshToken: string, userAgent?: string) {
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
      context: { reason: 'ADMIN_REFRESH_TOKEN_REUSE_DETECTED' },
    })

    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  if (stored.expires_at < new Date()) {
    await db.update(refreshTokens)
      .set({ is_revoked: true })
      .where(eq(refreshTokens.id, stored.id))
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.id, stored.id))

  const { user } = stored
  if (!user.is_active || user.role !== 'SUPER_ADMIN' || !user.two_fa_enabled) {
    throw new UnauthorizedError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
  }

  const tokens = await issueAdminTokenPair(user, userAgent)

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'TOKEN_REFRESH',
    resource_type: 'USER',
    resource_id: user.id,
    user_agent: userAgent,
    context: { scope: 'SUPER_ADMIN' },
  })

  return { user: sanitizeAdminUser(user), ...tokens }
}

export async function logoutAdmin(rawRefreshToken?: string, userAgent?: string) {
  if (!rawRefreshToken) return

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
    user_agent: userAgent,
    context: { scope: 'SUPER_ADMIN', refresh_token_id: stored.id },
  })
}

export async function getAdminMe(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!user || !user.is_active || user.role !== 'SUPER_ADMIN') {
    throw new UnauthorizedError('Invalid admin session', 'INVALID_ADMIN_SESSION')
  }

  return sanitizeAdminUser(user)
}

// ─── Platform password tickets ────────────────────────────────────────────────

export async function listPasswordTickets(query: ListPasswordTicketsQueryInput) {
  const offset = (query.page - 1) * query.limit
  const whereClause = query.status === 'all' ? undefined : eq(platformPasswordTickets.status, query.status)

  const [rows, totalRows] = await Promise.all([
    db.query.platformPasswordTickets.findMany({
      where: whereClause,
      with: {
        tenant: { columns: { id: true, name: true, slug: true } },
        user: { columns: { id: true, email: true, first_name: true, last_name: true, role: true } },
        resolver: { columns: { id: true, email: true, first_name: true, last_name: true } },
      },
      orderBy: [desc(platformPasswordTickets.created_at)],
      limit: query.limit,
      offset,
    }),
    whereClause
      ? db.select({ total: count() }).from(platformPasswordTickets).where(whereClause)
      : db.select({ total: count() }).from(platformPasswordTickets),
  ])

  return {
    data: rows,
    meta: {
      total: Number(totalRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    },
  }
}

export async function listAdminAuditLogs(query: ListAdminAuditLogsQueryInput) {
  const offset = (query.page - 1) * query.limit
  const conditions = []
  if (query.tenant_id) conditions.push(eq(auditLogs.tenant_id, query.tenant_id))
  if (query.actor_id) conditions.push(eq(auditLogs.actor_id, query.actor_id))
  if (query.action) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(auditLogs.action, query.action as any))
  }
  const whereClause = conditions.length ? and(...conditions) : undefined

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: auditLogs.id,
      tenant_id: auditLogs.tenant_id,
      actor_id: auditLogs.actor_id,
      actor_type: auditLogs.actor_type,
      actor_email: auditLogs.actor_email,
      action: auditLogs.action,
      resource_type: auditLogs.resource_type,
      resource_id: auditLogs.resource_id,
      ip_address: auditLogs.ip_address,
      user_agent: auditLogs.user_agent,
      changes: auditLogs.changes,
      context: auditLogs.context,
      created_at: auditLogs.created_at,
    })
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.created_at))
      .limit(query.limit)
      .offset(offset),
    whereClause
      ? db.select({ total: count() }).from(auditLogs).where(whereClause)
      : db.select({ total: count() }).from(auditLogs),
  ])

  return {
    data: rows,
    meta: {
      total: Number(totalRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    },
  }
}

export async function updatePasswordTicket(ticketId: string, input: UpdatePasswordTicketInput, adminId: string) {
  const existing = await db.query.platformPasswordTickets.findFirst({
    where: eq(platformPasswordTickets.id, ticketId),
    columns: { id: true, tenant_id: true, requester_email: true, status: true },
  })
  if (!existing) throw new NotFoundError('Password ticket')

  const nextStatus = input.status ?? existing.status
  const isResolved = nextStatus === 'RESOLVED' || nextStatus === 'REJECTED'
  const actor = await getAdminAuditActor(adminId)

  const [updated] = await db.update(platformPasswordTickets)
    .set({
      ...input,
      resolved_by: isResolved ? adminId : null,
      resolved_at: isResolved ? new Date() : null,
      updated_at: new Date(),
    })
    .where(eq(platformPasswordTickets.id, ticketId))
    .returning()

  if (existing.tenant_id) {
    await createAuditLog({
      tenant_id: existing.tenant_id,
      actor_id: adminId,
      actor_type: 'USER',
      actor_email: actor.email,
      action: 'SETTINGS_CHANGED',
      resource_type: 'PLATFORM_PASSWORD_TICKET',
      resource_id: ticketId,
      changes: { before: { status: existing.status }, after: { status: nextStatus, admin_notes: input.admin_notes } },
      context: { action: 'PASSWORD_TICKET_UPDATED', status: nextStatus },
    })
  }

  return updated
}

export async function issuePasswordResetLink(ticketId: string, adminId: string) {
  const ticket = await db.query.platformPasswordTickets.findFirst({
    where: eq(platformPasswordTickets.id, ticketId),
    with: {
      user: { columns: { id: true, tenant_id: true, email: true, first_name: true, last_name: true, is_active: true } },
      tenant: { columns: { name: true } },
    },
  })
  if (!ticket) throw new NotFoundError('Password ticket')
  if (!ticket.user || !ticket.user.is_active) throw new ForbiddenError('Cannot issue reset link for inactive or missing user', 'PASSWORD_TICKET_USER_INACTIVE')
  const actor = await getAdminAuditActor(adminId)

  const rawToken = generateOpaqueToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + SUPPORT_RESET_EXPIRES_MINUTES * 60 * 1000)

  await db.update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(and(eq(passwordResetTokens.user_id, ticket.user.id), isNull(passwordResetTokens.used_at)))

  await db.insert(passwordResetTokens).values({
    user_id: ticket.user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`

  await db.update(platformPasswordTickets)
    .set({
      status: 'IN_REVIEW',
      admin_notes: ticket.admin_notes ?? 'Enlace seguro emitido por administrador de plataforma.',
      updated_at: new Date(),
    })
    .where(eq(platformPasswordTickets.id, ticketId))

  await createAuditLog({
    tenant_id: ticket.user.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'TOKEN_GENERATED',
    resource_type: 'PLATFORM_PASSWORD_TICKET',
    resource_id: ticketId,
    context: { action: 'PASSWORD_RESET_LINK_ISSUED', target_user_id: ticket.user.id, expires_at: expiresAt.toISOString() },
  })

  await sendEmail({
    to: ticket.user.email,
    subject: 'Enlace seguro para actualizar contraseña — meditrack',
    html: supportResetEmailHtml(ticket.user.first_name, resetUrl, SUPPORT_RESET_EXPIRES_MINUTES),
    text: `Hola ${ticket.user.first_name},\n\nUn administrador de Meditrack revisó tu solicitud. Usa este enlace seguro para actualizar tu contraseña: ${resetUrl}\n\nExpira en ${SUPPORT_RESET_EXPIRES_MINUTES} minutos. Si no solicitaste ayuda, ignora este correo y contacta soporte.`,
  }).catch(err => console.error('[admin] support reset email failed:', err.message))

  return {
    reset_url: resetUrl,
    expires_at: expiresAt,
  }
}

// ─── Doctor verification ───────────────────────────────────────────────────────

export async function listPendingDoctors(query: ListUsersQueryInput) {
  const offset = (query.page - 1) * query.limit

  let whereClause
  if (query.status === 'pending') {
    whereClause = and(eq(users.is_verified, false), isNull(users.verification_rejected_at))
  } else if (query.status === 'verified') {
    whereClause = eq(users.is_verified, true)
  } else if (query.status === 'rejected') {
    whereClause = isNotNull(users.verification_rejected_at)
  }
  // 'all' → no filter

  const [rows, totalRows] = await Promise.all([
    db.query.users.findMany({
      where: whereClause,
      columns: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        colegiado_number: true,
        professional_id: true,
        specialty: true,
        dpi_document_key: true,
        is_verified: true,
        verification_rejected_at: true,
        verification_rejected_reason: true,
        created_at: true,
        role: true,
        tenant_id: true,
      },
      with: { tenant: { columns: { id: true, name: true, slug: true } } },
      orderBy: [desc(users.created_at)],
      limit: query.limit,
      offset,
    }),
    db.select({ total: count() }).from(users).where(whereClause),
  ])

  return {
    data: rows,
    meta: {
      total: Number(totalRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    },
  }
}

export async function verifyDoctor(userId: string, adminId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user) throw new NotFoundError('User')
  if (user.is_verified) return { message: 'Already verified' }
  const actor = await getAdminAuditActor(adminId)

  await db.update(users)
    .set({ is_verified: true, verification_rejected_at: null, verification_rejected_reason: null, updated_at: new Date() })
    .where(eq(users.id, userId))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'USER_VERIFIED',
    resource_type: 'USER',
    resource_id: userId,
  })

  return { message: 'Doctor verified successfully' }
}

export async function rejectDoctor(userId: string, input: RejectDoctorInput, adminId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user) throw new NotFoundError('User')
  const actor = await getAdminAuditActor(adminId)

  await db.update(users)
    .set({
      is_verified: false,
      verification_rejected_at: new Date(),
      verification_rejected_reason: input.reason,
      updated_at: new Date(),
    })
    .where(eq(users.id, userId))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'USER_REJECTED',
    resource_type: 'USER',
    resource_id: userId,
    context: { reason: input.reason },
  })

  return { message: 'Doctor registration rejected' }
}

// ─── Tenants ───────────────────────────────────────────────────────────────────

export async function listTenants(query: ListTenantsQueryInput) {
  const offset = (query.page - 1) * query.limit

  const [rows, totalRows] = await Promise.all([
    db.query.tenants.findMany({
      orderBy: [desc(tenants.created_at)],
      limit: query.limit,
      offset,
    }),
    db.select({ total: count() }).from(tenants),
  ])

  return {
    data: rows,
    meta: {
      total: Number(totalRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    },
  }
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput, adminId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })
  if (!tenant) throw new NotFoundError('Tenant')
  const actor = await getAdminAuditActor(adminId)

  const [updated] = await db.update(tenants)
    .set({ ...input, updated_at: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'TENANT_UPDATED',
    resource_type: 'TENANT',
    resource_id: tenantId,
    changes: {
      before: { plan_type: tenant.plan_type, status: tenant.status },
      after: { plan_type: updated.plan_type, status: updated.status },
    },
    context: { action: 'TENANT_UPDATED', fields: Object.keys(input) },
  })

  return updated
}

// ─── Metrics ───────────────────────────────────────────────────────────────────

export async function getMetrics() {
  const [
    totalDoctors,
    pendingVerification,
    totalTenants,
    activeTenants,
    openPasswordTickets,
  ] = await Promise.all([
    db.select({ total: count() }).from(users).where(eq(users.role, 'DOCTOR')),
    db.select({ total: count() }).from(users).where(
      and(eq(users.is_verified, false), isNull(users.verification_rejected_at)),
    ),
    db.select({ total: count() }).from(tenants),
    db.select({ total: count() }).from(tenants).where(eq(tenants.status, 'active')),
    db.select({ total: count() }).from(platformPasswordTickets).where(eq(platformPasswordTickets.status, 'OPEN')),
  ])

  return {
    doctors: {
      total: Number(totalDoctors[0]?.total ?? 0),
      pending_verification: Number(pendingVerification[0]?.total ?? 0),
    },
    tenants: {
      total: Number(totalTenants[0]?.total ?? 0),
      active: Number(activeTenants[0]?.total ?? 0),
    },
    tickets: {
      password_open: Number(openPasswordTickets[0]?.total ?? 0),
    },
  }
}

function supportResetEmailHtml(firstName: string, url: string, minutes: number): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">meditrack</p>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px">Actualizar contraseña</h2>
      <p style="margin:0 0 24px;color:#475569">Hola <strong>${firstName}</strong>, un administrador de Meditrack revisó tu solicitud. Usa este enlace seguro para actualizar tu contraseña.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
          Actualizar contraseña
        </a>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8">Este enlace expira en <strong>${minutes} minutos</strong>. Si no solicitaste ayuda, contacta a soporte.</p>
    </div>
  </div>
</body></html>`
}

async function issueAdminTokenPair(user: typeof users.$inferSelect, userAgent?: string) {
  const access_token = await signAccessToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
  })

  const refresh_token = generateRefreshToken()
  await db.insert(refreshTokens).values({
    user_id: user.id,
    token_hash: hashToken(refresh_token),
    device_hint: userAgent?.slice(0, 200),
    expires_at: refreshTokenExpiresAt(),
  })

  return { access_token, refresh_token }
}

async function getAdminAuditActor(adminId: string) {
  const actor = await db.query.users.findFirst({
    where: eq(users.id, adminId),
    columns: { id: true, email: true, role: true, is_active: true },
  })

  if (!actor || !actor.is_active || actor.role !== 'SUPER_ADMIN') {
    throw new UnauthorizedError('Invalid admin actor', 'INVALID_ADMIN_ACTOR')
  }

  return actor
}

function sanitizeAdminUser(user: typeof users.$inferSelect) {
  const { password_hash, two_fa_secret_encrypted, ...safeUser } = user
  return safeUser
}
