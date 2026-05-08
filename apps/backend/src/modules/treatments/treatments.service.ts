import { eq, and, gte, lte, desc } from 'drizzle-orm'
import {
  db, treatmentPlans, medicationItems, doseEvents,
  encounters, patients,
} from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError, AppError } from '../../shared/errors.ts'
import { generateDoseSchedule } from './schedule.engine.ts'
import type { CreateTreatmentInput, ConfirmDoseInput } from './treatments.schema.ts'

// ─── Create treatment plan ─────────────────────────────────────────────────────

export async function createTreatment(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  encounterId: string,
  input: CreateTreatmentInput,
) {
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
    columns: { id: true, patient_id: true, status: true },
  })
  if (!encounter) throw new NotFoundError('Encounter')
  if (encounter.status === 'CLOSED') {
    throw new ForbiddenError('Cannot add a treatment to a closed encounter')
  }

  // Calculate end_date from max duration across medications
  const maxDuration = Math.max(
    ...input.medications.map((m) => m.duration_days ?? 1),
  )
  const endDate = new Date(input.start_date)
  endDate.setDate(endDate.getDate() + maxDuration - 1)

  const [plan] = await db.insert(treatmentPlans).values({
    tenant_id: tenantId,
    patient_id: encounter.patient_id,
    encounter_id: encounterId,
    created_by: doctorId,
    name: input.name,
    start_date: input.start_date,
    end_date: endDate.toISOString().split('T')[0],
    instructions: input.instructions,
    status: 'DRAFT',
  }).returning()

  // Insert medication items
  const itemRows = await db.insert(medicationItems).values(
    input.medications.map((med, i) => ({
      treatment_plan_id: plan.id,
      ...med,
      sort_order: med.sort_order ?? i,
    })),
  ).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'TREATMENT_CREATED',
    resource_type: 'TREATMENT_PLAN',
    resource_id: plan.id,
    context: { encounter_id: encounterId, patient_id: encounter.patient_id },
  })

  return { ...plan, medications: itemRows }
}

// ─── Activate: generate dose events ──────────────────────────────────────────

export async function activateTreatment(
  tenantId: string,
  planId: string,
  doctorId: string,
  doctorEmail: string,
) {
  const plan = await db.query.treatmentPlans.findFirst({
    where: and(eq(treatmentPlans.patient_id, planId), eq(treatmentPlans.id, planId)),
    with: { medications: true },
  })

  // Re-query without the wrong double condition
  const planRow = await db.query.treatmentPlans.findFirst({
    where: eq(treatmentPlans.id, planId),
    with: { medications: true },
  })
  if (!planRow) throw new NotFoundError('Treatment plan')
  if (planRow.tenant_id !== tenantId) throw new NotFoundError('Treatment plan')
  if (planRow.status !== 'DRAFT') {
    throw new ForbiddenError(`Treatment is already ${planRow.status}`)
  }

  // Generate dose events for each active medication
  const allDoseEvents: Array<{
    medication_item_id: string
    patient_id: string
    scheduled_at: Date
    can_edit_until: Date
    status: 'PENDING'
  }> = []

  for (const med of planRow.medications) {
    const medInput = {
      drug_name: med.drug_name,
      presentation: med.presentation ?? undefined,
      concentration: med.concentration ?? undefined,
      dose_amount: med.dose_amount,
      dose_unit: med.dose_unit,
      route: med.route ?? undefined,
      frequency_type: med.frequency_type as 'DAILY' | 'EVERY_X_HOURS' | 'WEEKLY' | 'AS_NEEDED',
      frequency_value: med.frequency_value ?? undefined,
      times_per_day: (med.times_per_day as string[] | null) ?? undefined,
      duration_days: med.duration_days ?? undefined,
      special_instructions: med.special_instructions ?? undefined,
      with_food: med.with_food,
      sort_order: med.sort_order,
    }

    const schedule = generateDoseSchedule(medInput, planRow.start_date)

    for (const dose of schedule) {
      allDoseEvents.push({
        medication_item_id: med.id,
        patient_id: planRow.patient_id,
        scheduled_at: dose.scheduled_at,
        can_edit_until: dose.can_edit_until,
        status: 'PENDING',
      })
    }
  }

  // Batch insert all dose events
  if (allDoseEvents.length > 0) {
    await db.insert(doseEvents).values(allDoseEvents)
  }

  const [activated] = await db
    .update(treatmentPlans)
    .set({ status: 'ACTIVE', activated_at: new Date(), updated_at: new Date() })
    .where(eq(treatmentPlans.id, planId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'TREATMENT_ACTIVATED',
    resource_type: 'TREATMENT_PLAN',
    resource_id: planId,
    context: { dose_events_generated: allDoseEvents.length },
  })

  return { ...activated, dose_events_generated: allDoseEvents.length }
}

// ─── Suspend treatment ────────────────────────────────────────────────────────

export async function suspendTreatment(
  tenantId: string,
  planId: string,
  doctorId: string,
  doctorEmail: string,
) {
  const planRow = await db.query.treatmentPlans.findFirst({
    where: eq(treatmentPlans.id, planId),
  })
  if (!planRow || planRow.tenant_id !== tenantId) throw new NotFoundError('Treatment plan')
  if (planRow.status !== 'ACTIVE') throw new ForbiddenError('Only ACTIVE treatments can be suspended')

  // Cancel all pending future dose events
  await db
    .update(doseEvents)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(doseEvents.medication_item_id, planRow.id),
        eq(doseEvents.status, 'PENDING'),
        gte(doseEvents.scheduled_at, new Date()),
      ),
    )

  const [suspended] = await db
    .update(treatmentPlans)
    .set({ status: 'SUSPENDED', updated_at: new Date() })
    .where(eq(treatmentPlans.id, planId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'TREATMENT_SUSPENDED',
    resource_type: 'TREATMENT_PLAN',
    resource_id: planId,
  })

  return suspended
}

// ─── Get treatment with doses ─────────────────────────────────────────────────

export async function getTreatmentById(tenantId: string, planId: string) {
  const plan = await db.query.treatmentPlans.findFirst({
    where: eq(treatmentPlans.id, planId),
    with: {
      medications: {
        where: eq(medicationItems.is_active, true),
        orderBy: (m, { asc }) => asc(m.sort_order),
      },
    },
  })
  if (!plan || plan.tenant_id !== tenantId) throw new NotFoundError('Treatment plan')
  return plan
}

// ─── Dose confirmation (patient-facing) ──────────────────────────────────────

export async function confirmDose(
  patientId: string,
  doseEventId: string,
  input: ConfirmDoseInput,
  channel = 'portal',
) {
  const event = await db.query.doseEvents.findFirst({
    where: and(
      eq(doseEvents.id, doseEventId),
      eq(doseEvents.patient_id, patientId),
    ),
  })

  if (!event) throw new NotFoundError('Dose event')
  if (event.status === 'CONFIRMED') {
    throw new ForbiddenError('Dose is already confirmed')
  }

  // Enforce the 24-hour immutability window
  if (new Date() > event.can_edit_until) {
    throw new AppError(
      403,
      'DOSE_CONFIRMATION_WINDOW_EXPIRED',
      'This dose can no longer be modified — the 24-hour confirmation window has passed',
      { expired_at: event.can_edit_until },
    )
  }

  const [confirmed] = await db
    .update(doseEvents)
    .set({
      status: 'CONFIRMED',
      confirmed_at: new Date(),
      confirmation_channel: channel,
      notes: input.notes,
    })
    .where(eq(doseEvents.id, doseEventId))
    .returning()

  return confirmed
}

// ─── Get today's doses for patient portal ─────────────────────────────────────

export async function getTodayDoses(patientId: string) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const events = await db.query.doseEvents.findMany({
    where: and(
      eq(doseEvents.patient_id, patientId),
      gte(doseEvents.scheduled_at, todayStart),
      lte(doseEvents.scheduled_at, todayEnd),
    ),
    with: {
      medication_item: {
        columns: {
          drug_name: true,
          presentation: true,
          dose_amount: true,
          dose_unit: true,
          with_food: true,
          special_instructions: true,
        },
      },
    },
    orderBy: (d, { asc }) => asc(d.scheduled_at),
  })

  return events
}

// ─── Adherence score ──────────────────────────────────────────────────────────

export async function getAdherenceScore(patientId: string, planId: string) {
  const allEvents = await db.query.doseEvents.findMany({
    where: and(
      eq(doseEvents.patient_id, patientId),
      lte(doseEvents.scheduled_at, new Date()),
    ),
    columns: { status: true },
  })

  const relevant = allEvents.filter((e) => e.status !== 'CANCELLED' && e.status !== 'SUPERSEDED')
  const confirmed = relevant.filter((e) => e.status === 'CONFIRMED').length
  const total = relevant.length

  return {
    confirmed,
    total,
    score: total > 0 ? Math.round((confirmed / total) * 100) : 100,
    missed: relevant.filter((e) => e.status === 'MISSED').length,
    pending: relevant.filter((e) => e.status === 'PENDING').length,
  }
}
