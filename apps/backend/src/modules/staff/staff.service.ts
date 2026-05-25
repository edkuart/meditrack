import { eq, and, isNull, ne } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, users, tenants, staffInvitations, customRoles } from '../../shared/db/index.ts'
import { departmentMembers } from '../../shared/db/schema/departments.ts'
import { generateOpaqueToken, hashToken, signAccessToken, generateRefreshToken, refreshTokenExpiresAt } from '../../shared/services/token.service.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { assertStaffLimit } from '../../shared/services/limits.service.ts'
import { ConflictError, NotFoundError, UnauthorizedError, ForbiddenError } from '../../shared/errors.ts'
import type {
  InviteStaffInput,
  AcceptInviteInput,
  PromoteStaffInput,
  CreateCustomRoleInput,
  UpdateCustomRoleInput,
} from './staff.schema.ts'
import { refreshTokens } from '../../shared/db/index.ts'
import { PERMISSIONS, ROLE_PERMISSIONS, defaultPermissionsForRole, normalizePermissions, resolveEffectivePermissions } from '../../shared/permissions.ts'

const INVITE_EXPIRES_DAYS = 7
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
type AssignableRole = InviteStaffInput['role']
const ADMIN_ONLY_PERMISSIONS = new Set<string>([
  PERMISSIONS.STAFF_MANAGE,
  PERMISSIONS.HOSPITAL_MANAGE,
  PERMISSIONS.ANALYTICS_READ,
])

// ─── List clinic staff ─────────────────────────────────────────────────────────

export async function listStaff(tenantId: string) {
  const staff = await db.query.users.findMany({
    where: eq(users.tenant_id, tenantId),
    columns: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      custom_role_id: true,
      specialty: true,
      is_active: true,
      is_verified: true,
      created_at: true,
    },
    orderBy: (u, { asc }) => asc(u.created_at),
  })

  const roles = await db.query.customRoles.findMany({
    where: and(eq(customRoles.tenant_id, tenantId), eq(customRoles.is_active, true)),
    columns: {
      id: true,
      name: true,
      description: true,
      base_role: true,
      permissions: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  })
  const rolesById = new Map(roles.map(role => [role.id, role]))

  const pending = await db.query.staffInvitations.findMany({
    where: and(
      eq(staffInvitations.tenant_id, tenantId),
      isNull(staffInvitations.accepted_at),
    ),
    columns: {
      id: true,
      email: true,
      role: true,
      custom_role_id: true,
      expires_at: true,
      created_at: true,
    },
  })

  return {
    staff: staff.map(member => ({
      ...member,
      custom_role: member.custom_role_id ? rolesById.get(member.custom_role_id) ?? null : null,
    })),
    pending_invitations: pending
      .filter(i => i.expires_at > new Date())
      .map(invite => ({
        ...invite,
        custom_role: invite.custom_role_id ? rolesById.get(invite.custom_role_id) ?? null : null,
      })),
  }
}

export async function listCustomRoles(tenantId: string) {
  const tenantRoles = await db.query.customRoles.findMany({
    where: and(eq(customRoles.tenant_id, tenantId), eq(customRoles.is_active, true)),
    orderBy: (role, { asc }) => asc(role.name),
  })

  const system_roles = Object.entries(ROLE_PERMISSIONS)
    .filter(([role]) => role !== 'SUPER_ADMIN')
    .map(([role, permissions]) => ({
      id: role,
      name: role,
      base_role: role,
      description: null,
      permissions: Array.from(permissions),
      is_system: true,
    }))

  return {
    system_roles,
    custom_roles: tenantRoles.map(role => ({
      ...role,
      permissions: normalizePermissions(role.permissions),
      is_system: false,
    })),
  }
}

export async function createCustomRole(
  tenantId: string,
  creatorId: string,
  creatorEmail: string,
  input: CreateCustomRoleInput,
) {
  const permissions = normalizePermissions(input.permissions)
  assertCustomRolePermissions(input.base_role, permissions)
  const existing = await db.query.customRoles.findFirst({
    where: and(eq(customRoles.tenant_id, tenantId), eq(customRoles.name, input.name)),
    columns: { id: true },
  })
  if (existing) throw new ConflictError('Ya existe un rol con este nombre', 'CUSTOM_ROLE_EXISTS')

  const [created] = await db.insert(customRoles).values({
    tenant_id: tenantId,
    name: input.name,
    description: input.description,
    base_role: input.base_role,
    permissions,
    created_by: creatorId,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: creatorId,
    actor_type: 'USER',
    actor_email: creatorEmail,
    action: 'SETTINGS_CHANGED',
    resource_type: 'CUSTOM_ROLE',
    resource_id: created.id,
    context: { action: 'CUSTOM_ROLE_CREATED', name: created.name, base_role: created.base_role, permissions },
  })

  return { ...created, permissions, is_system: false }
}

export async function updateCustomRole(
  tenantId: string,
  updaterId: string,
  updaterEmail: string,
  roleId: string,
  input: UpdateCustomRoleInput,
) {
  const existing = await db.query.customRoles.findFirst({
    where: and(eq(customRoles.id, roleId), eq(customRoles.tenant_id, tenantId), eq(customRoles.is_active, true)),
  })
  if (!existing) throw new NotFoundError('Custom role')

  const patch: Partial<typeof customRoles.$inferInsert> = {
    updated_at: new Date(),
  }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.base_role !== undefined) patch.base_role = input.base_role
  if (input.permissions !== undefined) patch.permissions = normalizePermissions(input.permissions)

  assertCustomRolePermissions(
    input.base_role ?? existing.base_role,
    input.permissions !== undefined ? normalizePermissions(input.permissions) : normalizePermissions(existing.permissions),
  )

  if (input.name !== undefined) {
    const duplicate = await db.query.customRoles.findFirst({
      where: and(
        eq(customRoles.tenant_id, tenantId),
        eq(customRoles.name, input.name),
        ne(customRoles.id, roleId),
      ),
      columns: { id: true },
    })
    if (duplicate) throw new ConflictError('Ya existe un rol con este nombre', 'CUSTOM_ROLE_EXISTS')
  }

  const [updated] = await db.update(customRoles)
    .set(patch)
    .where(and(eq(customRoles.id, roleId), eq(customRoles.tenant_id, tenantId)))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: updaterId,
    actor_type: 'USER',
    actor_email: updaterEmail,
    action: 'SETTINGS_CHANGED',
    resource_type: 'CUSTOM_ROLE',
    resource_id: roleId,
    context: { action: 'CUSTOM_ROLE_UPDATED', changed: Object.keys(input) },
  })

  return { ...updated, permissions: normalizePermissions(updated.permissions), is_system: false }
}

export async function deactivateCustomRole(
  tenantId: string,
  updaterId: string,
  updaterEmail: string,
  roleId: string,
) {
  const existing = await db.query.customRoles.findFirst({
    where: and(eq(customRoles.id, roleId), eq(customRoles.tenant_id, tenantId), eq(customRoles.is_active, true)),
    columns: { id: true, name: true },
  })
  if (!existing) throw new NotFoundError('Custom role')

  await db.update(customRoles)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(customRoles.id, roleId), eq(customRoles.tenant_id, tenantId)))

  await db.update(users)
    .set({ custom_role_id: null, updated_at: new Date() })
    .where(and(eq(users.tenant_id, tenantId), eq(users.custom_role_id, roleId)))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: updaterId,
    actor_type: 'USER',
    actor_email: updaterEmail,
    action: 'SETTINGS_CHANGED',
    resource_type: 'CUSTOM_ROLE',
    resource_id: roleId,
    context: { action: 'CUSTOM_ROLE_DEACTIVATED', name: existing.name },
  })
}

// ─── Send staff invitation ─────────────────────────────────────────────────────

export async function inviteStaff(
  tenantId: string,
  inviterId: string,
  inviterName: string,
  input: InviteStaffInput,
) {
  await assertStaffLimit(tenantId)

  // Check email not already in system
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    columns: { id: true },
  })
  if (existing) throw new ConflictError('This email already has a meditrack account', 'EMAIL_TAKEN')

  // Check for an active pending invitation to this email in this tenant
  const existingInvite = await db.query.staffInvitations.findFirst({
    where: and(
      eq(staffInvitations.tenant_id, tenantId),
      eq(staffInvitations.email, input.email),
    ),
    orderBy: (i, { desc }) => desc(i.created_at),
    columns: { expires_at: true, accepted_at: true },
  })
  if (existingInvite && !existingInvite.accepted_at && existingInvite.expires_at > new Date()) {
    throw new ConflictError('A pending invitation already exists for this email', 'INVITE_EXISTS')
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { name: true },
  })

  const rawToken = generateOpaqueToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRES_DAYS)
  const roleAssignment = await resolveRoleAssignment(tenantId, input.role, input.custom_role_id)

  await db.insert(staffInvitations).values({
    tenant_id: tenantId,
    email: input.email,
    role: roleAssignment.role,
    custom_role_id: roleAssignment.custom_role_id,
    department_id: input.department_id,
    token_hash: tokenHash,
    invited_by: inviterId,
    expires_at: expiresAt,
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: inviterId,
    actor_type: 'USER',
    actor_email: inviterName,
    action: 'USER_INVITED',
    resource_type: 'USER',
    context: { email: input.email, role: roleAssignment.role, custom_role_id: roleAssignment.custom_role_id },
  })

  const inviteUrl = `${FRONTEND_URL}/accept-invite?token=${rawToken}`
  const clinicName = tenant?.name ?? 'tu clínica'

  sendEmail({
    to: input.email,
    subject: `Invitación a ${clinicName} en meditrack`,
    html: inviteEmailHtml(inviterName, clinicName, roleAssignment.label, inviteUrl, expiresAt),
    text: `${inviterName} te invita a unirte a ${clinicName} en meditrack.\n\nAccede aquí: ${inviteUrl}\n\nEl enlace expira en ${INVITE_EXPIRES_DAYS} días.`,
  }).catch(err => {
    console.error('[staff] invite email failed:', err.message)
    console.log(`\n[invite:fallback] ────────────────────────────────`)
    console.log(`  Para:  ${input.email}`)
    console.log(`  Link:  ${inviteUrl}`)
    console.log(`────────────────────────────────────────────────────\n`)
  })

  return {
    email: input.email,
    role: roleAssignment.role,
    custom_role_id: roleAssignment.custom_role_id,
    custom_role: roleAssignment.custom_role,
    expires_at: expiresAt,
  }
}

// ─── Accept invitation ─────────────────────────────────────────────────────────

export async function acceptInvitation(input: AcceptInviteInput) {
  const tokenHash = hashToken(input.token)

  const invite = await db.query.staffInvitations.findFirst({
    where: eq(staffInvitations.token_hash, tokenHash),
    with: { tenant: { columns: { id: true, name: true } } },
  })

  if (!invite) throw new UnauthorizedError('Invalid or expired invitation link', 'INVALID_TOKEN')
  if (invite.accepted_at) throw new ConflictError('This invitation has already been used', 'INVITE_USED')
  if (invite.expires_at < new Date()) throw new UnauthorizedError('This invitation has expired', 'TOKEN_EXPIRED')

  // Final check: email not taken (race condition guard)
  const existing = await db.query.users.findFirst({
    where: eq(users.email, invite.email),
    columns: { id: true },
  })
  if (existing) throw new ConflictError('This email already has an account', 'EMAIL_TAKEN')

  const password_hash = await bcrypt.hash(input.password, 12)

  const [user] = await db.insert(users).values({
    tenant_id: invite.tenant_id,
    email: invite.email,
    password_hash,
    role: invite.role,
    custom_role_id: invite.custom_role_id,
    first_name: input.first_name,
    last_name: input.last_name,
    specialty: input.specialty,
    professional_id: input.professional_id,
    is_verified: true,
  }).returning()

  await db.update(staffInvitations)
    .set({ accepted_at: new Date() })
    .where(eq(staffInvitations.token_hash, tokenHash))

  // Auto-assign to department if the invitation included one
  if (invite.department_id) {
    await db.insert(departmentMembers).values({
      user_id: user.id,
      department_id: invite.department_id,
    }).onConflictDoNothing()
  }

  await createAuditLog({
    tenant_id: invite.tenant_id,
    actor_id: user.id,
    actor_type: 'USER',
    actor_email: user.email,
    action: 'LOGIN_SUCCESS',
    resource_type: 'USER',
    resource_id: user.id,
    context: { via: 'staff_invitation' },
  })

  // Auto-login: issue token pair
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
    expires_at: refreshTokenExpiresAt(),
  })

  return {
    user: {
      id: user.id, email: user.email,
      first_name: user.first_name, last_name: user.last_name,
      role: user.role, custom_role_id: user.custom_role_id, tenant_id: user.tenant_id,
      permissions: await resolveEffectivePermissions(user.tenant_id, user.role, user.custom_role_id),
    },
    access_token,
    refresh_token: rawRefresh,
  }
}

// ─── Promote / change role ────────────────────────────────────────────────────

export async function promoteStaff(
  tenantId: string,
  requesterId: string,
  targetId: string,
  input: PromoteStaffInput,
) {
  if (requesterId === targetId) throw new ForbiddenError('Cannot change your own role')

  const roleAssignment = await resolveRoleAssignment(tenantId, input.role, input.custom_role_id ?? undefined)

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, targetId), eq(users.tenant_id, tenantId)),
    columns: { id: true, email: true, role: true },
  })
  if (!target) throw new NotFoundError('Staff member')
  if (target.role === 'SUPER_ADMIN') throw new ForbiddenError('Cannot modify a super admin account')

  const [updated] = await db
    .update(users)
    .set({
      role: roleAssignment.role,
      custom_role_id: roleAssignment.custom_role_id,
      updated_at: new Date(),
    })
    .where(eq(users.id, targetId))
    .returning({ id: users.id, email: users.email, role: users.role, custom_role_id: users.custom_role_id })

  return { ...updated, custom_role: roleAssignment.custom_role }
}

// ─── Deactivate staff ─────────────────────────────────────────────────────────

export async function deactivateStaff(tenantId: string, requesterId: string, targetId: string) {
  if (requesterId === targetId) throw new ForbiddenError('Cannot deactivate your own account')

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, targetId), eq(users.tenant_id, tenantId)),
    columns: { id: true, email: true, role: true },
  })
  if (!target) throw new NotFoundError('Staff member')
  if (target.role === 'SUPER_ADMIN') throw new ForbiddenError('Cannot modify a super admin account')

  await db.update(users)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(users.id, targetId))

  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.user_id, targetId))
}

// ─── Cancel invitation ────────────────────────────────────────────────────────

export async function cancelInvitation(tenantId: string, invitationId: string) {
  const invite = await db.query.staffInvitations.findFirst({
    where: and(eq(staffInvitations.id, invitationId), eq(staffInvitations.tenant_id, tenantId)),
    columns: { id: true, accepted_at: true },
  })
  if (!invite) throw new NotFoundError('Invitation')
  if (invite.accepted_at) throw new ForbiddenError('Invitation already accepted')

  await db.delete(staffInvitations).where(eq(staffInvitations.id, invitationId))
}

// ─── Resend invitation (cancel old + create new) ──────────────────────────────

export async function resendInvitation(
  tenantId: string,
  inviterId: string,
  inviterEmail: string,
  invitationId: string,
) {
  const invite = await db.query.staffInvitations.findFirst({
    where: and(eq(staffInvitations.id, invitationId), eq(staffInvitations.tenant_id, tenantId)),
    columns: { id: true, email: true, role: true, custom_role_id: true, department_id: true, accepted_at: true },
  })
  if (!invite) throw new NotFoundError('Invitation')
  if (invite.accepted_at) throw new ForbiddenError('Invitation already accepted')

  await db.delete(staffInvitations).where(eq(staffInvitations.id, invitationId))

  return inviteStaff(tenantId, inviterId, inviterEmail, {
    email: invite.email,
    role: invite.role as Exclude<typeof invite.role, 'SUPER_ADMIN'>,
    custom_role_id: invite.custom_role_id ?? undefined,
    department_id: invite.department_id ?? undefined,
  })
}

// ─── Get me (full profile from DB) ────────────────────────────────────────────

export async function getFullUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true, email: true, first_name: true, last_name: true,
      role: true, specialty: true, colegiado_number: true, professional_id: true,
      custom_role_id: true,
      tenant_id: true, is_active: true, is_verified: true,
      verification_rejected_at: true, verification_rejected_reason: true,
    },
    with: {
      tenant: { columns: { type: true } },
    },
  })
  if (!user || !user.is_active) throw new NotFoundError('User')
  const { tenant, ...rest } = user
  const customRole = rest.custom_role_id
    ? await db.query.customRoles.findFirst({
        where: and(
          eq(customRoles.id, rest.custom_role_id),
          eq(customRoles.tenant_id, rest.tenant_id),
          eq(customRoles.is_active, true),
        ),
        columns: { id: true, name: true, description: true, base_role: true, permissions: true },
      })
    : null
  return {
    ...rest,
    tenant_type: tenant?.type ?? 'CLINIC',
    custom_role: customRole ? { ...customRole, permissions: normalizePermissions(customRole.permissions) } : null,
    permissions: await resolveEffectivePermissions(rest.tenant_id, rest.role, rest.custom_role_id),
  }
}

// ─── Invite email template ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ADMIN_CLINIC: 'Administrador', DOCTOR: 'Médico', NURSE: 'Enfermero/a', ASSISTANT: 'Asistente',
  LAB_TECHNICIAN: 'Técnico de Laboratorio', RADIOLOGIST: 'Radiólogo/a',
  PHARMACIST: 'Farmacéutico/a', RECEPTIONIST: 'Recepcionista', WARD_NURSE: 'Enfermero/a de Sala',
}

function inviteEmailHtml(
  inviterName: string,
  clinicName: string,
  role: string,
  url: string,
  expiresAt: Date,
): string {
  const expiresStr = expiresAt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
  const roleLabel = ROLE_LABELS[role] ?? role

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">meditrack</p>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Invitación al equipo</h2>
      <p style="margin:0 0 8px;color:#475569"><strong>${inviterName}</strong> te invita a unirte a <strong>${clinicName}</strong> como <strong>${roleLabel}</strong> en meditrack.</p>
      <p style="margin:0 0 24px;color:#475569">Meditrack es una plataforma médica para el seguimiento de tratamientos y adherencia terapéutica.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
          Aceptar invitación →
        </a>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8">Este enlace expira el <strong>${expiresStr}</strong>. Si no esperabas esta invitación, ignora este correo.</p>
    </div>
  </div>
</body></html>`
}

async function resolveRoleAssignment(
  tenantId: string,
  requestedRole: AssignableRole,
  customRoleId?: string | null,
) {
  if (!customRoleId) {
    return {
      role: requestedRole,
      custom_role_id: null,
      custom_role: null,
      label: requestedRole,
      permissions: defaultPermissionsForRole(requestedRole),
    }
  }

  const customRole = await db.query.customRoles.findFirst({
    where: and(
      eq(customRoles.id, customRoleId),
      eq(customRoles.tenant_id, tenantId),
      eq(customRoles.is_active, true),
    ),
  })
  if (!customRole) throw new NotFoundError('Custom role')

  if (customRole.base_role === 'SUPER_ADMIN') {
    throw new ForbiddenError('Custom roles cannot use platform admin permissions')
  }
  assertCustomRolePermissions(customRole.base_role, normalizePermissions(customRole.permissions))

  return {
    role: customRole.base_role as AssignableRole,
    custom_role_id: customRole.id,
    custom_role: { ...customRole, permissions: normalizePermissions(customRole.permissions), is_system: false },
    label: customRole.name,
    permissions: normalizePermissions(customRole.permissions),
  }
}

function assertCustomRolePermissions(baseRole: string, permissions: readonly string[]) {
  if (baseRole === 'SUPER_ADMIN') {
    throw new ForbiddenError('Custom roles cannot use platform admin permissions')
  }

  if (baseRole !== 'ADMIN_CLINIC' && permissions.some(permission => ADMIN_ONLY_PERMISSIONS.has(permission))) {
    throw new ForbiddenError('Only administrator roles can receive staff, hospital or analytics management permissions')
  }
}
