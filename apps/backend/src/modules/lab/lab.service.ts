import { eq, and, desc, inArray } from 'drizzle-orm'
import { db, labOrders, labResults, patients, users, encounters } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError } from '../../shared/errors.ts'
import type {
  CreateLabOrderInput,
  UpdateLabOrderInput,
  UpsertLabResultsInput,
  LabResultInput,
} from './lab.schema.ts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(
  numericValue: number | undefined,
  refMin: number | undefined,
  refMax: number | undefined,
): 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW' | 'PENDING' {
  if (numericValue == null) return 'PENDING'
  if (refMin != null && numericValue < refMin) {
    return numericValue < refMin * 0.7 ? 'CRITICAL_LOW' : 'LOW'
  }
  if (refMax != null && numericValue > refMax) {
    return numericValue > refMax * 1.3 ? 'CRITICAL_HIGH' : 'HIGH'
  }
  if (refMin != null || refMax != null) return 'NORMAL'
  return 'PENDING'
}

function toResultValues(r: LabResultInput, orderId: string, tenantId: string, idx: number) {
  const status = computeStatus(r.numeric_value, r.ref_min, r.ref_max)
  return {
    order_id:       orderId,
    tenant_id:      tenantId,
    panel_name:     r.panel_name,
    parameter_name: r.parameter_name,
    value:          r.value,
    numeric_value:  r.numeric_value != null ? String(r.numeric_value) : undefined,
    unit:           r.unit,
    ref_min:        r.ref_min != null ? String(r.ref_min) : undefined,
    ref_max:        r.ref_max != null ? String(r.ref_max) : undefined,
    ref_text:       r.ref_text,
    status,
    notes:          r.notes,
    sort_order:     r.sort_order ?? idx,
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listLabOrders(tenantId: string, patientId?: string) {
  const rows = await db.query.labOrders.findMany({
    where: patientId
      ? and(eq(labOrders.tenant_id, tenantId), eq(labOrders.patient_id, patientId))
      : eq(labOrders.tenant_id, tenantId),
    orderBy: desc(labOrders.ordered_at),
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true } },
      doctor:  { columns: { id: true, first_name: true, last_name: true } },
      results: { orderBy: (r, { asc }) => [asc(r.sort_order)] },
    },
  })
  return rows
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getLabOrder(tenantId: string, orderId: string) {
  const order = await db.query.labOrders.findFirst({
    where: and(eq(labOrders.tenant_id, tenantId), eq(labOrders.id, orderId)),
    with: {
      patient:   { columns: { id: true, first_name: true, last_name: true, date_of_birth: true, sex: true } },
      doctor:    { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      encounter: { columns: { id: true, encounter_type: true, opened_at: true } },
      results:   { orderBy: (r, { asc }) => [asc(r.sort_order)] },
    },
  })
  if (!order) throw new NotFoundError('LabOrder')
  return order
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createLabOrder(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  input: CreateLabOrderInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, input.patient_id)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [order] = await db
    .insert(labOrders)
    .values({
      tenant_id:    tenantId,
      patient_id:   input.patient_id,
      encounter_id: input.encounter_id,
      ordered_by:   doctorId,
      notes:        input.notes,
      status:       'PENDING',
    })
    .returning()

  if (input.results.length > 0) {
    await db.insert(labResults).values(
      input.results.map((r, i) => toResultValues(r, order.id, tenantId, i)),
    )
  }

  await createAuditLog({
    tenant_id:     tenantId,
    actor_id:      doctorId,
    actor_type:    'USER',
    actor_email:   doctorEmail,
    action:        'LAB_ORDER_CREATED',
    resource_type: 'LAB_ORDER',
    resource_id:   order.id,
    context:       { patient_id: input.patient_id },
  })

  return getLabOrder(tenantId, order.id)
}

// ─── Update order status / notes ──────────────────────────────────────────────

export async function updateLabOrder(
  tenantId: string,
  orderId: string,
  doctorId: string,
  doctorEmail: string,
  input: UpdateLabOrderInput,
) {
  const existing = await db.query.labOrders.findFirst({
    where: and(eq(labOrders.tenant_id, tenantId), eq(labOrders.id, orderId)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('LabOrder')

  const [updated] = await db
    .update(labOrders)
    .set({ ...input, updated_at: new Date() })
    .where(and(eq(labOrders.tenant_id, tenantId), eq(labOrders.id, orderId)))
    .returning()

  await createAuditLog({
    tenant_id:     tenantId,
    actor_id:      doctorId,
    actor_type:    'USER',
    actor_email:   doctorEmail,
    action:        'LAB_ORDER_UPDATED',
    resource_type: 'LAB_ORDER',
    resource_id:   orderId,
    context:       { status: input.status },
  })

  return getLabOrder(tenantId, updated.id)
}

// ─── Upsert results ───────────────────────────────────────────────────────────

export async function upsertLabResults(
  tenantId: string,
  orderId: string,
  doctorId: string,
  doctorEmail: string,
  input: UpsertLabResultsInput,
) {
  const order = await db.query.labOrders.findFirst({
    where: and(eq(labOrders.tenant_id, tenantId), eq(labOrders.id, orderId)),
    columns: { id: true },
  })
  if (!order) throw new NotFoundError('LabOrder')

  // Delete existing results and re-insert (simpler than partial upsert for small sets)
  await db.delete(labResults).where(eq(labResults.order_id, orderId))

  await db.insert(labResults).values(
    input.results.map((r, i) => toResultValues(r, orderId, tenantId, i)),
  )

  // Auto-complete order if all results are non-pending
  const allResults = await db.query.labResults.findMany({
    where: eq(labResults.order_id, orderId),
    columns: { status: true },
  })
  const allFilled = allResults.length > 0 && allResults.every(r => r.status !== 'PENDING')
  if (allFilled) {
    await db.update(labOrders)
      .set({ status: 'COMPLETED', updated_at: new Date() })
      .where(eq(labOrders.id, orderId))
  }

  await createAuditLog({
    tenant_id:     tenantId,
    actor_id:      doctorId,
    actor_type:    'USER',
    actor_email:   doctorEmail,
    action:        'LAB_RESULTS_ENTERED',
    resource_type: 'LAB_ORDER',
    resource_id:   orderId,
    context:       { count: input.results.length },
  })

  return getLabOrder(tenantId, orderId)
}
