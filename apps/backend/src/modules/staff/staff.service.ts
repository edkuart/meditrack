import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db, users, tenants, staffInvitations } from '../../shared/db/index.ts'
import { departmentMembers } from '../../shared/db/schema/departments.ts'
import { generateOpaqueToken, hashToken, signAccessToken, generateRefreshToken, refreshTokenExpiresAt } from '../../shared/services/token.service.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { assertStaffLimit } from '../../shared/services/limits.service.ts'
import { ConflictError, NotFoundError, UnauthorizedError, ForbiddenError } from '../../shared/errors.ts'
import type { InviteStaffInput, AcceptInviteInput } from './staff.schema.ts'
import { refreshTokens } from '../../shared/db/index.ts'

const INVITE_EXPIRES_DAYS = 7
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

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
      specialty: true,
      is_active: true,
      is_verified: true,
      created_at: true,
    },
    orderBy: (u, { asc }) => asc(u.created_at),
  })

  const pending = await db.query.staffInvitations.findMany({
    where: and(
      eq(staffInvitations.tenant_id, tenantId),
      eq(staffInvitations.accepted_at, null as unknown as Date),
    ),
    columns: {
      id: true,
      email: true,
      role: true,
      expires_at: true,
      created_at: true,
    },
  })

  return { staff, pending_invitations: pending.filter(i => i.expires_at > new Date()) }
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

  await db.insert(staffInvitations).values({
    tenant_id: tenantId,
    email: input.email,
    role: input.role,
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
    context: { email: input.email, role: input.role },
  })

  const inviteUrl = `${FRONTEND_URL}/accept-invite?token=${rawToken}`
  const clinicName = tenant?.name ?? 'tu clínica'

  sendEmail({
    to: input.email,
    subject: `Invitación a ${clinicName} en meditrack`,
    html: inviteEmailHtml(inviterName, clinicName, input.role, inviteUrl, expiresAt),
    text: `${inviterName} te invita a unirte a ${clinicName} en meditrack.\n\nAccede aquí: ${inviteUrl}\n\nEl enlace expira en ${INVITE_EXPIRES_DAYS} días.`,
  }).catch(err => console.error('[staff] invite email failed:', err))

  return { email: input.email, role: input.role, expires_at: expiresAt }
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
      role: user.role, tenant_id: user.tenant_id,
    },
    access_token,
    refresh_token: rawRefresh,
  }
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

// ─── Get me (full profile from DB) ────────────────────────────────────────────

export async function getFullUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true, email: true, first_name: true, last_name: true,
      role: true, specialty: true, colegiado_number: true,
      tenant_id: true, is_active: true, is_verified: true,
      verification_rejected_at: true, verification_rejected_reason: true,
    },
  })
  if (!user || !user.is_active) throw new NotFoundError('User')
  return user
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
