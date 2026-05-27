import { eq, and, isNull, isNotNull, count, desc, gt, gte, lte, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import {
  db,
  users,
  tenants,
  patients,
  refreshTokens,
  platformPasswordTickets,
  passwordResetTokens,
  auditLogs,
  tenantAccessGrants,
  billingInvoices,
} from '../../shared/db/index.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
  generateOpaqueToken,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { getAiUsageStatus } from '../ai-usage/ai-usage.service.ts'
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.ts'
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
  UpdateUserStatusInput,
  ListUsersQueryInput,
  ListTenantsQueryInput,
  ListCommercialAccountsQueryInput,
  ListPasswordTicketsQueryInput,
  ListAdminAuditLogsQueryInput,
  UpdateTenantInput,
  CreateTenantAccessGrantInput,
  RevokeTenantAccessGrantInput,
  UpdatePasswordTicketInput,
} from './admin.schema.ts'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const SUPPORT_RESET_EXPIRES_MINUTES = 30

const TRIAL_DURATION_DAYS: Record<Exclude<CreateTenantAccessGrantInput['duration'], 'custom'>, number> = {
  '1_day': 1,
  '7_days': 7,
  '30_days': 30,
  '365_days': 365,
}

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
        tenant: { columns: { id: true, name: true, slug: true, plan_type: true, status: true } },
        user: {
          columns: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            role: true,
            is_active: true,
            is_verified: true,
            last_login_at: true,
          },
        },
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

  const data = await Promise.all(rows.map(async (ticket) => {
    const [openTicketsRows, recentAudit] = await Promise.all([
      db.select({ total: count() })
        .from(platformPasswordTickets)
        .where(and(
          eq(platformPasswordTickets.requester_email, ticket.requester_email),
          eq(platformPasswordTickets.status, 'OPEN'),
        )),
      ticket.tenant_id
        ? db.query.auditLogs.findMany({
            where: eq(auditLogs.tenant_id, ticket.tenant_id),
            columns: {
              id: true,
              action: true,
              resource_type: true,
              actor_email: true,
              created_at: true,
            },
            orderBy: [desc(auditLogs.created_at)],
            limit: 3,
          })
        : Promise.resolve([]),
    ])

    return {
      ...ticket,
      support_context: {
        open_tickets_for_email: Number(openTicketsRows[0]?.total ?? 0),
        user_status: ticket.user
          ? {
              is_active: ticket.user.is_active,
              is_verified: ticket.user.is_verified,
              last_login_at: ticket.user.last_login_at,
            }
          : null,
        tenant_status: ticket.tenant
          ? {
              plan_type: ticket.tenant.plan_type,
              status: ticket.tenant.status,
            }
          : null,
        recent_audit: recentAudit,
      },
    }
  }))

  return {
    data,
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
        is_active: true,
        verification_rejected_at: true,
        verification_rejected_reason: true,
        last_login_at: true,
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

export async function updateUserStatus(userId: string, input: UpdateUserStatusInput, adminId: string) {
  if (userId === adminId && !input.is_active) {
    throw new ForbiddenError('No puedes desactivar tu propio usuario administrador.', 'SELF_DEACTIVATION_FORBIDDEN')
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user) throw new NotFoundError('User')
  if (user.role === 'SUPER_ADMIN' && !input.is_active) {
    throw new ForbiddenError('No se puede desactivar un SUPER_ADMIN desde esta acción operativa.', 'SUPER_ADMIN_DEACTIVATION_FORBIDDEN')
  }
  const actor = await getAdminAuditActor(adminId)

  const [updated] = await db.update(users)
    .set({ is_active: input.is_active, updated_at: new Date() })
    .where(eq(users.id, userId))
    .returning()

  if (!input.is_active) {
    await db.update(refreshTokens)
      .set({ is_revoked: true })
      .where(eq(refreshTokens.user_id, userId))
  }

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: input.is_active ? 'SETTINGS_CHANGED' : 'USER_DEACTIVATED',
    resource_type: 'USER',
    resource_id: userId,
    changes: {
      before: { is_active: user.is_active },
      after: { is_active: updated.is_active },
    },
    context: {
      action: input.is_active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
      reason: input.reason,
      target_email: user.email,
      target_role: user.role,
    },
  })

  return sanitizeAdminUser(updated)
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

  const data = await Promise.all(rows.map(async (tenant) => {
    const [owner, staffRows, patientRows, lastLogin] = await Promise.all([
      findTenantOwner(tenant.id),
      db.select({ total: count() }).from(users).where(and(eq(users.tenant_id, tenant.id), eq(users.is_active, true))),
      db.select({ total: count() }).from(patients).where(and(eq(patients.tenant_id, tenant.id), eq(patients.is_active, true))),
      db.query.users.findFirst({
        where: eq(users.tenant_id, tenant.id),
        columns: { last_login_at: true },
        orderBy: [desc(users.last_login_at)],
      }),
    ])

    return {
      ...tenant,
      owner: owner ?? null,
      usage: {
        staff: Number(staffRows[0]?.total ?? 0),
        patients: Number(patientRows[0]?.total ?? 0),
      },
      last_login_at: lastLogin?.last_login_at ?? null,
    }
  }))

  return {
    data,
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
  const { reason, ...tenantUpdate } = input

  const [updated] = await db.update(tenants)
    .set({ ...tenantUpdate, updated_at: new Date() })
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
    context: { action: 'TENANT_UPDATED', fields: Object.keys(tenantUpdate), reason },
  })

  return updated
}

export async function listCommercialAccounts(query: ListCommercialAccountsQueryInput) {
  await expireExpiredTenantAccessGrants()

  const offset = (query.page - 1) * query.limit
  const now = new Date()
  const expiringUntil = addDays(now, 3)

  const [
    rows,
    totalRows,
    commercialSummary,
  ] = await Promise.all([
    db.query.tenants.findMany({
      orderBy: [desc(tenants.created_at)],
      limit: query.limit,
      offset,
    }),
    db.select({ total: count() }).from(tenants),
    getCommercialSummary(now, expiringUntil),
  ])

  const data = await Promise.all(rows.map(async (tenant) => {
    const [
      owner,
      activeGrant,
      grantHistory,
      staffRows,
      patientRows,
      aiUsage,
      billingSummary,
      latestInvoice,
      latestPendingInvoice,
    ] = await Promise.all([
      findTenantOwner(tenant.id),
      db.query.tenantAccessGrants.findFirst({
        where: and(
          eq(tenantAccessGrants.tenant_id, tenant.id),
          eq(tenantAccessGrants.status, 'active'),
          lte(tenantAccessGrants.starts_at, now),
          gt(tenantAccessGrants.ends_at, now),
        ),
        orderBy: [desc(tenantAccessGrants.ends_at)],
      }),
      db.query.tenantAccessGrants.findMany({
        where: eq(tenantAccessGrants.tenant_id, tenant.id),
        orderBy: [desc(tenantAccessGrants.created_at)],
        limit: 5,
      }),
      db.select({ total: count() }).from(users).where(and(eq(users.tenant_id, tenant.id), eq(users.is_active, true))),
      db.select({ total: count() }).from(patients).where(and(eq(patients.tenant_id, tenant.id), eq(patients.is_active, true))),
      getAiUsageStatus(tenant.id),
      getTenantBillingSummary(tenant.id),
      db.query.billingInvoices.findFirst({
        where: eq(billingInvoices.tenant_id, tenant.id),
        orderBy: [desc(billingInvoices.created_at)],
      }),
      db.query.billingInvoices.findFirst({
        where: and(eq(billingInvoices.tenant_id, tenant.id), eq(billingInvoices.status, 'pending')),
        orderBy: [desc(billingInvoices.created_at)],
      }),
    ])
    const latestGrant = grantHistory[0] ?? null
    const daysRemaining = activeGrant ? Math.ceil((activeGrant.ends_at.getTime() - now.getTime()) / 86_400_000) : null
    const trialStatus = activeGrant
      ? (daysRemaining !== null && daysRemaining <= 3 ? 'expiring' : 'active')
      : latestGrant?.status === 'expired'
        ? 'expired'
        : latestGrant?.status === 'converted'
          ? 'converted'
          : 'none'

    return {
      tenant,
      owner,
      active_grant: activeGrant ?? null,
      grant_history: grantHistory,
      commercial_state: {
        trial_status: trialStatus,
        days_remaining: daysRemaining,
        latest_grant_status: latestGrant?.status ?? null,
        latest_grant_ended_at: latestGrant?.ends_at ?? null,
      },
      usage: {
        organizations: 1,
        staff: Number(staffRows[0]?.total ?? 0),
        patients: Number(patientRows[0]?.total ?? 0),
        ai: aiUsage,
      },
      billing: {
        revenue_paid_gtq: billingSummary.revenue_paid_gtq,
        revenue_pending_gtq: billingSummary.revenue_pending_gtq,
        paid_invoice_count: billingSummary.paid_invoice_count,
        pending_invoice_count: billingSummary.pending_invoice_count,
        latest_invoice: latestInvoice ?? null,
        latest_pending_invoice: latestPendingInvoice ?? null,
      },
    }
  }))

  return {
    data,
    meta: {
      total: Number(totalRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    },
    summary: commercialSummary,
  }
}

export async function createTenantAccessGrant(tenantId: string, input: CreateTenantAccessGrantInput, adminId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })
  if (!tenant) throw new NotFoundError('Tenant')

  const actor = await getAdminAuditActor(adminId)
  const startsAt = new Date()
  const endsAt = input.duration === 'custom'
    ? new Date(input.ends_at as string)
    : addDays(startsAt, TRIAL_DURATION_DAYS[input.duration])

  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new ValidationError('La fecha de finalización debe ser posterior al inicio de la prueba.')
  }

  await db.update(tenantAccessGrants)
    .set({
      status: 'revoked',
      revoked_by: adminId,
      revoked_at: startsAt,
      updated_at: startsAt,
    })
    .where(and(eq(tenantAccessGrants.tenant_id, tenantId), eq(tenantAccessGrants.status, 'active')))

  const [grant] = await db.insert(tenantAccessGrants).values({
    tenant_id: tenantId,
    grant_type: input.grant_type,
    plan_type: input.plan_type,
    starts_at: startsAt,
    ends_at: endsAt,
    reason: input.reason,
    notes: input.notes,
    max_ai_units_monthly: input.max_ai_units_monthly,
    max_organizations: input.max_organizations,
    max_staff: input.max_staff,
    max_patients: input.max_patients,
    granted_by: adminId,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'SETTINGS_CHANGED',
    resource_type: 'TENANT_ACCESS_GRANT',
    resource_id: grant.id,
    changes: {
      before: null,
      after: {
        grant_type: grant.grant_type,
        plan_type: grant.plan_type,
        starts_at: grant.starts_at,
        ends_at: grant.ends_at,
      },
    },
    context: {
      action: 'TENANT_ACCESS_GRANTED',
      tenant_name: tenant.name,
      duration: input.duration,
      reason: input.reason,
    },
  })

  return grant
}

export async function revokeTenantAccessGrant(grantId: string, input: RevokeTenantAccessGrantInput, adminId: string) {
  const grant = await db.query.tenantAccessGrants.findFirst({
    where: eq(tenantAccessGrants.id, grantId),
  })
  if (!grant) throw new NotFoundError('Tenant access grant')

  const actor = await getAdminAuditActor(adminId)
  const revokedAt = new Date()

  const [updated] = await db.update(tenantAccessGrants)
    .set({
      status: 'revoked',
      revoked_by: adminId,
      revoked_at: revokedAt,
      updated_at: revokedAt,
    })
    .where(eq(tenantAccessGrants.id, grantId))
    .returning()

  await createAuditLog({
    tenant_id: grant.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: actor.email,
    action: 'SETTINGS_CHANGED',
    resource_type: 'TENANT_ACCESS_GRANT',
    resource_id: grantId,
    changes: {
      before: { status: grant.status, revoked_at: grant.revoked_at },
      after: { status: updated.status, revoked_at: updated.revoked_at },
    },
    context: {
      action: 'TENANT_ACCESS_REVOKED',
      reason: input.reason,
    },
  })

  return updated
}

export async function expireExpiredTenantAccessGrants() {
  const now = new Date()

  await db.update(tenantAccessGrants)
    .set({
      status: 'expired',
      updated_at: now,
    })
    .where(and(
      eq(tenantAccessGrants.status, 'active'),
      lte(tenantAccessGrants.ends_at, now),
    ))
}

async function getCommercialSummary(now: Date, expiringUntil: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const [
    activeTrials,
    expiringTrials,
    expiredTrials,
    convertedTrials,
    revokedTrials,
    paidDoctorTenants,
    paidClinicTenants,
    paidRevenue,
    paidRevenueThisMonth,
    pendingRevenue,
    paidDoctorRevenue,
    paidClinicRevenue,
  ] = await Promise.all([
    db.select({ total: count() }).from(tenantAccessGrants).where(and(
      eq(tenantAccessGrants.status, 'active'),
      gt(tenantAccessGrants.ends_at, now),
    )),
    db.select({ total: count() }).from(tenantAccessGrants).where(and(
      eq(tenantAccessGrants.status, 'active'),
      gt(tenantAccessGrants.ends_at, now),
      lte(tenantAccessGrants.ends_at, expiringUntil),
    )),
    db.select({ total: count() }).from(tenantAccessGrants).where(eq(tenantAccessGrants.status, 'expired')),
    db.select({ total: count() }).from(tenantAccessGrants).where(eq(tenantAccessGrants.status, 'converted')),
    db.select({ total: count() }).from(tenantAccessGrants).where(eq(tenantAccessGrants.status, 'revoked')),
    db.select({ total: count() }).from(tenants).where(eq(tenants.plan_type, 'doctor_individual')),
    db.select({ total: count() }).from(tenants).where(eq(tenants.plan_type, 'clinic_complete')),
    sumInvoiceAmount(and(eq(billingInvoices.status, 'paid'))),
    sumInvoiceAmount(and(eq(billingInvoices.status, 'paid'), gte(billingInvoices.paid_at, monthStart))),
    sumInvoiceAmount(and(eq(billingInvoices.status, 'pending'))),
    sumInvoiceAmount(and(eq(billingInvoices.status, 'paid'), eq(billingInvoices.plan_type, 'doctor_individual'))),
    sumInvoiceAmount(and(eq(billingInvoices.status, 'paid'), eq(billingInvoices.plan_type, 'clinic_complete'))),
  ])

  const converted = Number(convertedTrials[0]?.total ?? 0)
  const expired = Number(expiredTrials[0]?.total ?? 0)
  const revoked = Number(revokedTrials[0]?.total ?? 0)
  const completed = converted + expired + revoked

  return {
    trials: {
      active: Number(activeTrials[0]?.total ?? 0),
      expiring: Number(expiringTrials[0]?.total ?? 0),
      expired,
      converted,
      revoked,
      conversion_rate: completed > 0 ? Math.round((converted / completed) * 100) : 0,
    },
    paid_tenants: {
      doctor_individual: Number(paidDoctorTenants[0]?.total ?? 0),
      clinic_complete: Number(paidClinicTenants[0]?.total ?? 0),
      total: Number(paidDoctorTenants[0]?.total ?? 0) + Number(paidClinicTenants[0]?.total ?? 0),
    },
    revenue: {
      paid_total_gtq: paidRevenue,
      paid_this_month_gtq: paidRevenueThisMonth,
      pending_gtq: pendingRevenue,
      by_plan: {
        doctor_individual_gtq: paidDoctorRevenue,
        clinic_complete_gtq: paidClinicRevenue,
      },
    },
  }
}

async function getTenantBillingSummary(tenantId: string) {
  const [
    paidRevenue,
    pendingRevenue,
    paidInvoices,
    pendingInvoices,
  ] = await Promise.all([
    sumInvoiceAmount(and(eq(billingInvoices.tenant_id, tenantId), eq(billingInvoices.status, 'paid'))),
    sumInvoiceAmount(and(eq(billingInvoices.tenant_id, tenantId), eq(billingInvoices.status, 'pending'))),
    db.select({ total: count() }).from(billingInvoices).where(and(eq(billingInvoices.tenant_id, tenantId), eq(billingInvoices.status, 'paid'))),
    db.select({ total: count() }).from(billingInvoices).where(and(eq(billingInvoices.tenant_id, tenantId), eq(billingInvoices.status, 'pending'))),
  ])

  return {
    revenue_paid_gtq: paidRevenue,
    revenue_pending_gtq: pendingRevenue,
    paid_invoice_count: Number(paidInvoices[0]?.total ?? 0),
    pending_invoice_count: Number(pendingInvoices[0]?.total ?? 0),
  }
}

async function sumInvoiceAmount(where: ReturnType<typeof and>) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${billingInvoices.amount_gtq}), 0)` })
    .from(billingInvoices)
    .where(where)

  return Number(row?.total ?? 0)
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

async function findTenantOwner(tenantId: string) {
  const admin = await db.query.users.findFirst({
    where: and(eq(users.tenant_id, tenantId), eq(users.role, 'ADMIN_CLINIC')),
    columns: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
    },
  })
  if (admin) return admin

  return db.query.users.findFirst({
    where: and(eq(users.tenant_id, tenantId), eq(users.role, 'DOCTOR')),
    columns: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
    },
  })
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function sanitizeAdminUser(user: typeof users.$inferSelect) {
  const { password_hash, two_fa_secret_encrypted, ...safeUser } = user
  return safeUser
}
