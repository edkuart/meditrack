import { eq, and, gte, lte, inArray, count } from 'drizzle-orm'
import {
  db, treatmentPlans, medicationItems, doseEvents,
  encounters, patients, auditLogs,
} from '../../shared/db/index.ts'
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
  // Calculate end_date from max duration across medications
  const maxDuration = Math.max(
    ...input.medications.map((m) => m.duration_days ?? 1),
  )
  const endDate = new Date(input.start_date)
  endDate.setDate(endDate.getDate() + maxDuration - 1)

  return db.transaction(async (tx) => {
    const encounter = await tx.query.encounters.findFirst({
      where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
      columns: { id: true, patient_id: true, status: true },
    })
    if (!encounter) throw new NotFoundError('Encounter')
    if (encounter.status === 'CLOSED') {
      throw new ForbiddenError('Cannot add a treatment to a closed encounter')
    }

    const [plan] = await tx.insert(treatmentPlans).values({
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

    const itemRows = await tx.insert(medicationItems).values(
      input.medications.map((med, i) => ({
        treatment_plan_id: plan.id,
        ...med,
        sort_order: med.sort_order ?? i,
      })),
    ).returning()

    await tx.insert(auditLogs).values({
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
  })
}

// ─── Activate: generate dose events ──────────────────────────────────────────

export async function activateTreatment(
  tenantId: string,
  planId: string,
  doctorId: string,
  doctorEmail: string,
) {
  return db.transaction(async (tx) => {
    const planRow = await tx.query.treatmentPlans.findFirst({
      where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.id, planId)),
      with: { medications: true },
    })
    if (!planRow) throw new NotFoundError('Treatment plan')
    if (planRow.status !== 'DRAFT') {
      throw new ForbiddenError(`Treatment is already ${planRow.status}`)
    }

    const [activated] = await tx
      .update(treatmentPlans)
      .set({ status: 'ACTIVE', activated_at: new Date(), updated_at: new Date() })
      .where(and(
        eq(treatmentPlans.tenant_id, tenantId),
        eq(treatmentPlans.id, planId),
        eq(treatmentPlans.status, 'DRAFT'),
      ))
      .returning()

    if (!activated) {
      throw new ForbiddenError('Treatment was already modified')
    }

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

    if (allDoseEvents.length > 0) {
      await tx.insert(doseEvents).values(allDoseEvents)
    }

    await tx.insert(auditLogs).values({
      tenant_id: tenantId,
      actor_id: doctorId,
      actor_type: 'USER',
      actor_email: doctorEmail,
      action: 'TREATMENT_ACTIVATED',
      resource_type: 'TREATMENT_PLAN',
      resource_id: planId,
      context: {
        patient_id: planRow.patient_id,
        dose_events_generated: allDoseEvents.length,
      },
    })

    return { ...activated, dose_events_generated: allDoseEvents.length }
  })
}

// ─── Suspend treatment ────────────────────────────────────────────────────────

export async function suspendTreatment(
  tenantId: string,
  planId: string,
  doctorId: string,
  doctorEmail: string,
) {
  return db.transaction(async (tx) => {
    const planRow = await tx.query.treatmentPlans.findFirst({
      where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.id, planId)),
      with: { medications: true },
    })
    if (!planRow) throw new NotFoundError('Treatment plan')
    if (planRow.status !== 'ACTIVE') throw new ForbiddenError('Only ACTIVE treatments can be suspended')

    const medIds = planRow.medications.map((med) => med.id)
    let cancelledDoseEvents = 0

    if (medIds.length > 0) {
      const cancelled = await tx
        .update(doseEvents)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            inArray(doseEvents.medication_item_id, medIds),
            eq(doseEvents.status, 'PENDING'),
            gte(doseEvents.scheduled_at, new Date()),
          ),
        )
        .returning({ id: doseEvents.id })
      cancelledDoseEvents = cancelled.length
    }

    const [suspended] = await tx
      .update(treatmentPlans)
      .set({ status: 'SUSPENDED', updated_at: new Date() })
      .where(and(
        eq(treatmentPlans.tenant_id, tenantId),
        eq(treatmentPlans.id, planId),
        eq(treatmentPlans.status, 'ACTIVE'),
      ))
      .returning()

    if (!suspended) {
      throw new ForbiddenError('Treatment was already modified')
    }

    await tx.insert(auditLogs).values({
      tenant_id: tenantId,
      actor_id: doctorId,
      actor_type: 'USER',
      actor_email: doctorEmail,
      action: 'TREATMENT_SUSPENDED',
      resource_type: 'TREATMENT_PLAN',
      resource_id: planId,
      context: {
        patient_id: planRow.patient_id,
        cancelled_dose_events: cancelledDoseEvents,
      },
    })

    return suspended
  })
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

export async function listTreatmentsByPatient(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.treatmentPlans.findMany({
    where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.patient_id, patientId)),
    with: {
      medications: {
        where: eq(medicationItems.is_active, true),
        orderBy: (m, { asc }) => asc(m.sort_order),
      },
    },
    orderBy: (plans, { desc }) => desc(plans.created_at),
  })
}

// ─── Dose confirmation (patient-facing) ──────────────────────────────────────

export async function confirmDose(
  patientId: string,
  doseEventId: string,
  input: ConfirmDoseInput,
  channel = 'portal',
) {
  return db.transaction(async (tx) => {
    const event = await tx.query.doseEvents.findFirst({
      where: and(
        eq(doseEvents.id, doseEventId),
        eq(doseEvents.patient_id, patientId),
      ),
    })

    if (!event) throw new NotFoundError('Dose event')
    if (event.status === 'CONFIRMED') {
      throw new ForbiddenError('Dose is already confirmed')
    }

    const patient = await tx.query.patients.findFirst({
      where: eq(patients.id, patientId),
      columns: { tenant_id: true },
    })
    if (!patient) throw new NotFoundError('Patient')

    if (new Date() > event.can_edit_until) {
      throw new AppError(
        403,
        'DOSE_CONFIRMATION_WINDOW_EXPIRED',
        'This dose can no longer be modified — the 24-hour confirmation window has passed',
        { expired_at: event.can_edit_until },
      )
    }

    const [confirmed] = await tx
      .update(doseEvents)
      .set({
        status: 'CONFIRMED',
        confirmed_at: new Date(),
        confirmation_channel: channel,
        notes: input.notes,
      })
      .where(and(
        eq(doseEvents.id, doseEventId),
        eq(doseEvents.patient_id, patientId),
        eq(doseEvents.status, 'PENDING'),
      ))
      .returning()

    if (!confirmed) {
      throw new ForbiddenError('Dose was already modified')
    }

    await tx.insert(auditLogs).values({
      tenant_id: patient.tenant_id,
      actor_id: patientId,
      actor_type: 'PATIENT',
      action: 'DOSE_CONFIRMED',
      resource_type: 'DOSE_EVENT',
      resource_id: doseEventId,
      context: {
        patient_id: patientId,
        channel,
        medication_item_id: event.medication_item_id,
      },
    })

    return confirmed
  })
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
  const rows = await db
    .select({
      status: doseEvents.status,
      cnt: count(doseEvents.id),
    })
    .from(doseEvents)
    .innerJoin(medicationItems, eq(doseEvents.medication_item_id, medicationItems.id))
    .where(and(
      eq(doseEvents.patient_id, patientId),
      eq(medicationItems.treatment_plan_id, planId),
      lte(doseEvents.scheduled_at, new Date()),
    ))
    .groupBy(doseEvents.status)

  const statusCounts = Object.fromEntries(
    rows.map(row => [row.status, Number(row.cnt)]),
  ) as Record<string, number>

  const confirmed = statusCounts['CONFIRMED'] ?? 0
  const cancelled = statusCounts['CANCELLED'] ?? 0
  const superseded = statusCounts['SUPERSEDED'] ?? 0
  const total = rows.reduce((sum, row) => sum + Number(row.cnt), 0) - cancelled - superseded

  return {
    confirmed,
    total,
    score: total > 0 ? Math.round((confirmed / total) * 100) : 100,
    missed: statusCounts['MISSED'] ?? 0,
    pending: statusCounts['PENDING'] ?? 0,
  }
}
