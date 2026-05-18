import { eq, and } from 'drizzle-orm'
import { db, tenants, users } from '../../shared/db/index.ts'
import { departments, departmentMembers } from '../../shared/db/schema/departments.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors.ts'
import type { CreateDepartmentInput, UpdateDepartmentInput, AddMemberInput } from './departments.schema.ts'

// ─── Guard: tenant must be a HOSPITAL ─────────────────────────────────────────

async function requireHospitalTenant(tenantId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { type: true },
  })
  if (!tenant) throw new NotFoundError('Tenant')
  if (tenant.type !== 'HOSPITAL') {
    throw new ForbiddenError(
      'Departments are only available for hospital tenants. Upgrade your tenant type first.',
      'NOT_HOSPITAL',
    )
  }
}

// ─── Departments CRUD ──────────────────────────────────────────────────────────

export async function listDepartments(tenantId: string) {
  return db.query.departments.findMany({
    where: eq(departments.tenant_id, tenantId),
    with: {
      head_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      members: {
        with: {
          user: { columns: { id: true, first_name: true, last_name: true, role: true, specialty: true } },
        },
      },
    },
    orderBy: departments.name,
  })
}

export async function getDepartment(tenantId: string, departmentId: string) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)),
    with: {
      head_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      members: {
        with: {
          user: { columns: { id: true, first_name: true, last_name: true, role: true, specialty: true, email: true } },
        },
      },
    },
  })
  if (!dept) throw new NotFoundError('Department')
  return dept
}

export async function createDepartment(
  tenantId: string,
  input: CreateDepartmentInput,
  actorId: string,
) {
  await requireHospitalTenant(tenantId)

  if (input.head_doctor_id) {
    const doctor = await db.query.users.findFirst({
      where: and(eq(users.id, input.head_doctor_id), eq(users.tenant_id, tenantId)),
      columns: { id: true },
    })
    if (!doctor) throw new NotFoundError('Doctor')
  }

  const [dept] = await db.insert(departments).values({
    tenant_id: tenantId,
    name: input.name,
    type: input.type,
    head_doctor_id: input.head_doctor_id,
    location_id: input.location_id,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'SETTINGS_CHANGED',
    resource_type: 'DEPARTMENT',
    resource_id: dept.id,
    context: { action: 'DEPARTMENT_CREATED', name: input.name },
  })

  return dept
}

export async function updateDepartment(
  tenantId: string,
  departmentId: string,
  input: UpdateDepartmentInput,
  actorId: string,
) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!dept) throw new NotFoundError('Department')

  const [updated] = await db.update(departments)
    .set({ ...input, updated_at: new Date() })
    .where(and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'SETTINGS_CHANGED',
    resource_type: 'DEPARTMENT',
    resource_id: departmentId,
    context: { action: 'DEPARTMENT_UPDATED', changes: input },
  })

  return updated
}

export async function deleteDepartment(tenantId: string, departmentId: string, actorId: string) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)),
    columns: { id: true, name: true },
  })
  if (!dept) throw new NotFoundError('Department')

  // Soft delete — keeps historical audit trail
  await db.update(departments)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(departments.id, departmentId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'SETTINGS_CHANGED',
    resource_type: 'DEPARTMENT',
    resource_id: departmentId,
    context: { action: 'DEPARTMENT_DEACTIVATED', name: dept.name },
  })

  return { message: 'Department deactivated' }
}

// ─── Members ───────────────────────────────────────────────────────────────────

export async function addMember(
  tenantId: string,
  departmentId: string,
  input: AddMemberInput,
  actorId: string,
) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!dept) throw new NotFoundError('Department')

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, input.user_id), eq(users.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!user) throw new NotFoundError('User')

  const existing = await db.query.departmentMembers.findFirst({
    where: and(
      eq(departmentMembers.user_id, input.user_id),
      eq(departmentMembers.department_id, departmentId),
    ),
  })
  if (existing) throw new ConflictError('User is already a member of this department', 'ALREADY_MEMBER')

  await db.insert(departmentMembers).values({
    user_id: input.user_id,
    department_id: departmentId,
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'SETTINGS_CHANGED',
    resource_type: 'DEPARTMENT',
    resource_id: departmentId,
    context: { action: 'MEMBER_ADDED', user_id: input.user_id },
  })

  return { message: 'Member added' }
}

export async function removeMember(
  tenantId: string,
  departmentId: string,
  userId: string,
  actorId: string,
) {
  const dept = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!dept) throw new NotFoundError('Department')

  await db.delete(departmentMembers).where(
    and(
      eq(departmentMembers.user_id, userId),
      eq(departmentMembers.department_id, departmentId),
    ),
  )

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'SETTINGS_CHANGED',
    resource_type: 'DEPARTMENT',
    resource_id: departmentId,
    context: { action: 'MEMBER_REMOVED', user_id: userId },
  })

  return { message: 'Member removed' }
}

// ─── Tenant type upgrade ───────────────────────────────────────────────────────

export async function upgradeTenantToHospital(tenantId: string, actorId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, type: true, name: true },
  })
  if (!tenant) throw new NotFoundError('Tenant')
  if (tenant.type === 'HOSPITAL') return { message: 'Already a hospital' }

  await db.update(tenants)
    .set({ type: 'HOSPITAL', updated_at: new Date() })
    .where(eq(tenants.id, tenantId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: '',
    action: 'TENANT_UPDATED',
    resource_type: 'TENANT',
    resource_id: tenantId,
    context: { action: 'UPGRADED_TO_HOSPITAL', name: tenant.name },
  })

  return { message: 'Tenant upgraded to hospital' }
}
