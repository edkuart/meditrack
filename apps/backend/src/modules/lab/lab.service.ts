import { eq, and, sql } from 'drizzle-orm'
import { db, labOrders, labResults, patients } from '../../shared/db/index.ts'
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

type LabResultListRow = {
  id: string
  order_id: string
  tenant_id: string
  panel_name: string
  parameter_name: string
  value: string | null
  numeric_value: string | null
  unit: string | null
  ref_min: string | null
  ref_max: string | null
  ref_text: string | null
  status: string
  notes: string | null
  sort_order: number
  created_at: Date | string
  updated_at: Date | string
}

type RawLabOrderRow = {
  id: string
  tenant_id: string
  patient_id: string
  encounter_id: string | null
  ordered_by: string
  status: string
  notes: string | null
  ordered_at: Date | string
  created_at: Date | string
  updated_at: Date | string
  patient__id: string | null
  patient__first_name: string | null
  patient__last_name: string | null
  doctor__id: string | null
  doctor__first_name: string | null
  doctor__last_name: string | null
}

type LabOrderListRow = Omit<RawLabOrderRow,
  'patient__id' | 'patient__first_name' | 'patient__last_name' |
  'doctor__id' | 'doctor__first_name' | 'doctor__last_name'
> & {
  patient: { id: string; first_name: string | null; last_name: string | null } | null
  doctor: { id: string; first_name: string | null; last_name: string | null } | null
  results: LabResultListRow[]
}

export async function listLabOrders(tenantId: string, patientId?: string): Promise<LabOrderListRow[]> {
  const [hasOrderedAt, hasLabOrderUpdatedAt, hasSortOrder, hasLabResultUpdatedAt] = await Promise.all([
    hasColumn('lab_orders', 'ordered_at'),
    hasColumn('lab_orders', 'updated_at'),
    hasColumn('lab_results', 'sort_order'),
    hasColumn('lab_results', 'updated_at'),
  ])

  const orderedAtExpr = sql.raw(hasOrderedAt ? 'lo.ordered_at' : 'lo.created_at')
  const orderUpdatedAtExpr = sql.raw(hasLabOrderUpdatedAt ? 'lo.updated_at' : 'lo.created_at')
  const where = patientId
    ? sql`lo.tenant_id = ${tenantId} and lo.patient_id = ${patientId}`
    : sql`lo.tenant_id = ${tenantId}`

  const orderRows = rowsFromResult<RawLabOrderRow>(await db.execute(sql`
    select
      lo.id,
      lo.tenant_id,
      lo.patient_id,
      lo.encounter_id,
      lo.ordered_by,
      lo.status,
      lo.notes,
      ${orderedAtExpr} as ordered_at,
      lo.created_at,
      ${orderUpdatedAtExpr} as updated_at,
      p.id as patient__id,
      p.first_name as patient__first_name,
      p.last_name as patient__last_name,
      u.id as doctor__id,
      u.first_name as doctor__first_name,
      u.last_name as doctor__last_name
    from lab_orders lo
    left join patients p on p.id = lo.patient_id
    left join users u on u.id = lo.ordered_by
    where ${where}
    order by ${orderedAtExpr} desc
  `))

  const results = await Promise.all(orderRows.map(async (order) => {
    const sortOrderExpr = sql.raw(hasSortOrder ? 'lr.sort_order' : '0')
    const resultUpdatedAtExpr = sql.raw(hasLabResultUpdatedAt ? 'lr.updated_at' : 'lr.created_at')
    const resultRows = rowsFromResult<LabResultListRow>(await db.execute(sql`
      select
        lr.id,
        lr.order_id,
        lr.tenant_id,
        lr.panel_name,
        lr.parameter_name,
        lr.value,
        lr.numeric_value,
        lr.unit,
        lr.ref_min,
        lr.ref_max,
        lr.ref_text,
        lr.status,
        lr.notes,
        ${sortOrderExpr} as sort_order,
        lr.created_at,
        ${resultUpdatedAtExpr} as updated_at
      from lab_results lr
      where lr.order_id = ${String(order.id)}
      order by ${sortOrderExpr} asc, lr.created_at asc
    `))

    return {
      id: order.id,
      tenant_id: order.tenant_id,
      patient_id: order.patient_id,
      encounter_id: order.encounter_id,
      ordered_by: order.ordered_by,
      status: order.status,
      notes: order.notes,
      ordered_at: order.ordered_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
      patient: order.patient__id
        ? { id: order.patient__id, first_name: order.patient__first_name, last_name: order.patient__last_name }
        : null,
      doctor: order.doctor__id
        ? { id: order.doctor__id, first_name: order.doctor__first_name, last_name: order.doctor__last_name }
        : null,
      results: resultRows,
    }
  }))

  return results
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getLabOrder(tenantId: string, orderId: string) {
  const order = (await listLabOrders(tenantId)).find((row) => row.id === orderId)
  if (!order) throw new NotFoundError('LabOrder')
  return order
}

async function hasColumn(tableName: string, columnName: string) {
  const rows = rowsFromResult<{ exists: boolean }>(await db.execute(sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `))
  return Boolean(rows[0]?.exists)
}

function rowsFromResult<T extends object>(result: unknown): T[] {
  return Array.isArray(result) ? result as T[] : Array.from(result as Iterable<T>)
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
