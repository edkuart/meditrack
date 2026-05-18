import { eq, and, isNull, isNotNull, count, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, users, tenants, refreshTokens } from '../../shared/db/index.ts'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../../shared/services/token.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../shared/errors.ts'
import type {
  AdminLoginInput,
  RejectDoctorInput,
  ListUsersQueryInput,
  ListTenantsQueryInput,
  UpdateTenantInput,
} from './admin.schema.ts'

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
    throw new ForbiddenError('Access denied', 'FORBIDDEN')
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

  const access_token = await signAccessToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
  })

  const rawRefresh = generateRefreshToken()
  await db.insert(refreshTokens).values({
    user_id: user.id,
    token_hash: hashToken(rawRefresh),
    device_hint: userAgent?.slice(0, 200),
    expires_at: refreshTokenExpiresAt(),
  })

  await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id))

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

  const { password_hash, ...safeUser } = user
  return { user: safeUser, access_token, refresh_token: rawRefresh }
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

  await db.update(users)
    .set({ is_verified: true, verification_rejected_at: null, verification_rejected_reason: null, updated_at: new Date() })
    .where(eq(users.id, userId))

  await createAuditLog({
    tenant_id: user.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: 'admin',
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
    actor_email: 'admin',
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

  const [updated] = await db.update(tenants)
    .set({ ...input, updated_at: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: adminId,
    actor_type: 'USER',
    actor_email: 'admin',
    action: 'TENANT_UPDATED',
    resource_type: 'TENANT',
    resource_id: tenantId,
    context: input,
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
  ] = await Promise.all([
    db.select({ total: count() }).from(users).where(eq(users.role, 'DOCTOR')),
    db.select({ total: count() }).from(users).where(
      and(eq(users.is_verified, false), isNull(users.verification_rejected_at)),
    ),
    db.select({ total: count() }).from(tenants),
    db.select({ total: count() }).from(tenants).where(eq(tenants.status, 'active')),
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
  }
}
