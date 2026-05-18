import { eq, and, or, ilike, sql, desc, asc, count } from 'drizzle-orm'
import {
  db,
  patients,
  patientMrnCounters,
  encounters,
  treatmentPlans,
  patientCheckIns,
  patientBackground,
  patientProblems,
  vitalSigns,
  clinicalReviewItems,
} from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { assertPatientLimit } from '../../shared/services/limits.service.ts'
import { NotFoundError, ConflictError } from '../../shared/errors.ts'
import type { CreatePatientInput, UpdatePatientInput, SearchPatientsInput } from './patients.schema.ts'

const CORE_BACKGROUND_CATEGORIES = ['ALERGIAS', 'MEDICAMENTOS', 'APP'] as const
const WORKFLOW_STAGES = [
  'INTAKE',
  'ROOMING',
  'SUBJECTIVE',
  'OBJECTIVE',
  'ASSESSMENT',
  'PLAN',
  'ORDERS',
  'READY_TO_CLOSE',
] as const

type WorkflowStage = typeof WORKFLOW_STAGES[number]

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function getWorkflowStage(metadata: unknown): WorkflowStage {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'SUBJECTIVE'
  const value = (metadata as Record<string, unknown>).workflow_stage
  return typeof value === 'string' && WORKFLOW_STAGES.includes(value as WorkflowStage)
    ? value as WorkflowStage
    : 'SUBJECTIVE'
}

// ─── MRN ──────────────────────────────────────────────────────────────────────

async function generateMrn(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const [row] = await db
    .insert(patientMrnCounters)
    .values({ tenant_id: tenantId, year: year as unknown as number, last_seq: 1 })
    .onConflictDoUpdate({
      target: [patientMrnCounters.tenant_id, patientMrnCounters.year],
      set: { last_seq: sql`patient_mrn_counters.last_seq + 1` },
    })
    .returning({ last_seq: patientMrnCounters.last_seq })
  return `MT-${year}-${String(row.last_seq).padStart(6, '0')}`
}

// ─── Search ────────────────────────────────────────────────────────────────────

export async function searchPatients(tenantId: string, input: SearchPatientsInput) {
  const { q, page, limit } = input
  const offset = (page - 1) * limit

  const baseWhere = eq(patients.tenant_id, tenantId)

  const searchWhere = q
    ? or(
        sql`LOWER(${patients.first_name} || ' ' || ${patients.last_name}) LIKE LOWER(${'%' + q + '%'})`,
        sql`LOWER(${patients.last_name} || ' ' || ${patients.first_name}) LIKE LOWER(${'%' + q + '%'})`,
        ilike(patients.id_number, `%${q}%`),
        ilike(patients.phone, `%${q}%`),
        ilike(patients.mrn, `%${q}%`),
      )
    : undefined

  const where = searchWhere ? and(baseWhere, searchWhere) : baseWhere

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: patients.id,
        mrn: patients.mrn,
        first_name: patients.first_name,
        last_name: patients.last_name,
        date_of_birth: patients.date_of_birth,
        sex: patients.sex,
        phone: patients.phone,
        email: patients.email,
        id_number: patients.id_number,
        tags: patients.tags,
        is_active: patients.is_active,
        created_at: patients.created_at,
      })
      .from(patients)
      .where(where)
      .orderBy(desc(patients.created_at))
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(patients)
      .where(where),
  ])

  return {
    patients: rows,
    meta: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createPatient(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  input: CreatePatientInput,
) {
  await assertPatientLimit(tenantId)

  // Deduplication: warn if same id_number already exists in this tenant
  if (input.id_number) {
    const existing = await db.query.patients.findFirst({
      where: and(
        eq(patients.tenant_id, tenantId),
        eq(patients.id_number, input.id_number),
      ),
      columns: { id: true, first_name: true, last_name: true },
    })

    if (existing) {
      throw new ConflictError(
        `A patient with ID number ${input.id_number} already exists: ${existing.first_name} ${existing.last_name}`,
        'PATIENT_DUPLICATE_ID',
      )
    }
  }

  const mrn = await generateMrn(tenantId)

  const [patient] = await db
    .insert(patients)
    .values({
      tenant_id: tenantId,
      created_by: doctorId,
      mrn,
      ...input,
      tags: input.tags as string[],
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'PATIENT_CREATED',
    resource_type: 'PATIENT',
    resource_id: patient.id,
  })

  return patient
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getPatientById(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
) {
  const patient = await db.query.patients.findFirst({
    where: and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ),
  })

  if (!patient) throw new NotFoundError('Patient')

  // Fetch summary stats alongside
  const [encounterCount] = await db
    .select({ total: count() })
    .from(encounters)
    .where(and(
      eq(encounters.tenant_id, tenantId),
      eq(encounters.patient_id, patientId),
    ))

  const activeTreatment = await db.query.treatmentPlans.findFirst({
    where: and(
      eq(treatmentPlans.patient_id, patientId),
      eq(treatmentPlans.status, 'ACTIVE'),
    ),
    columns: { id: true, name: true, start_date: true, end_date: true, status: true },
    orderBy: (t, { desc }) => desc(t.created_at),
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_VIEWED',
    resource_type: 'PATIENT',
    resource_id: patientId,
  })

  return {
    ...patient,
    _summary: {
      encounter_count: Number(encounterCount.total),
      active_treatment: activeTreatment ?? null,
    },
  }
}

export async function listPatientCheckIns(tenantId: string, patientId: string, limit = 14) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.patientCheckIns.findMany({
    where: and(
      eq(patientCheckIns.tenant_id, tenantId),
      eq(patientCheckIns.patient_id, patientId),
    ),
    orderBy: (c, { desc }) => desc(c.check_in_date),
    limit,
  })
}

// ─── Clinical workspace ──────────────────────────────────────────────────────

export async function getPatientClinicalWorkspace(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: {
      id: true,
      first_name: true,
      last_name: true,
      date_of_birth: true,
      sex: true,
      phone: true,
      email: true,
      id_number: true,
      emergency_contact: true,
      notes: true,
      tags: true,
      created_at: true,
      updated_at: true,
    },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [
    openEncounters,
    latestEncounters,
    latestVitals,
    background,
    problems,
    treatments,
    pendingReviewItems,
  ] = await Promise.all([
    db.query.encounters.findMany({
      where: and(
        eq(encounters.tenant_id, tenantId),
        eq(encounters.patient_id, patientId),
        eq(encounters.status, 'OPEN'),
      ),
      orderBy: (row, { desc }) => desc(row.opened_at),
      limit: 5,
    }),
    db.query.encounters.findMany({
      where: and(eq(encounters.tenant_id, tenantId), eq(encounters.patient_id, patientId)),
      columns: {
        id: true,
        encounter_type: true,
        status: true,
        chief_complaint: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        summary: true,
        metadata: true,
        opened_at: true,
        closed_at: true,
      },
      orderBy: (row, { desc }) => desc(row.opened_at),
      limit: 10,
    }),
    db.query.vitalSigns.findMany({
      where: and(eq(vitalSigns.tenant_id, tenantId), eq(vitalSigns.patient_id, patientId)),
      orderBy: (row, { desc }) => desc(row.recorded_at),
      limit: 5,
    }),
    db.query.patientBackground.findMany({
      where: and(
        eq(patientBackground.tenant_id, tenantId),
        eq(patientBackground.patient_id, patientId),
        eq(patientBackground.is_current, true),
      ),
      orderBy: asc(patientBackground.category),
    }),
    db.query.patientProblems.findMany({
      where: and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.patient_id, patientId)),
      orderBy: asc(patientProblems.problem_number),
      limit: 20,
    }),
    db.query.treatmentPlans.findMany({
      where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.patient_id, patientId)),
      orderBy: (row, { desc }) => desc(row.created_at),
      limit: 10,
    }),
    db.query.clinicalReviewItems.findMany({
      where: and(
        eq(clinicalReviewItems.tenant_id, tenantId),
        eq(clinicalReviewItems.patient_id, patientId),
        eq(clinicalReviewItems.status, 'PENDING'),
      ),
      orderBy: (row, { desc }) => desc(row.created_at),
      limit: 10,
    }),
  ])

  const activeEncounter = openEncounters[0] ?? null
  const activeEncounterTreatment = activeEncounter
    ? treatments.find((treatment) => treatment.encounter_id === activeEncounter.id) ?? null
    : null
  const currentBackgroundCategories = new Set(background.map((item) => item.category))
  const missingCoreBackground = CORE_BACKGROUND_CATEGORIES.filter(
    category => !currentBackgroundCategories.has(category),
  )
  const activeEncounterVital = activeEncounter
    ? latestVitals.find((record) => (
        record.encounter_id === activeEncounter.id ||
        new Date(record.recorded_at).getTime() >= new Date(activeEncounter.opened_at).getTime() ||
        (
          !record.encounter_id &&
          new Date(record.recorded_at).getTime() >= new Date(activeEncounter.opened_at).getTime() - 6 * 60 * 60 * 1000
        )
      )) ?? null
    : null

  const hasSubjective = Boolean(activeEncounter && (
    hasText(activeEncounter.chief_complaint) || hasText(activeEncounter.subjective) || hasText(activeEncounter.notes)
  ))
  const hasObjective = Boolean(activeEncounter && (
    hasText(activeEncounter.objective) || Boolean(activeEncounterVital)
  ))
  const hasAssessment = Boolean(activeEncounter && hasText(activeEncounter.assessment))
  const hasPlan = Boolean(activeEncounter && (
    hasText(activeEncounter.plan) || hasText(activeEncounter.summary) || Boolean(activeEncounterTreatment)
  ))

  const nextActions: Array<{
    key: string
    label: string
    priority: 'HIGH' | 'NORMAL' | 'LOW'
    target: 'PATIENT' | 'ENCOUNTER' | 'AI'
  }> = []

  if (!activeEncounter) {
    nextActions.push({
      key: 'START_ENCOUNTER',
      label: 'Iniciar una consulta activa para documentar el encuentro.',
      priority: 'HIGH',
      target: 'PATIENT',
    })
  } else {
    if (!hasSubjective) {
      nextActions.push({
        key: 'CAPTURE_SUBJECTIVE',
        label: 'Registrar motivo de consulta e historia del padecimiento actual.',
        priority: 'HIGH',
        target: 'ENCOUNTER',
      })
    }
    if (!activeEncounterVital) {
      nextActions.push({
        key: 'RECORD_VITALS',
        label: 'Registrar signos vitales o marcar que no aplican para esta atención.',
        priority: 'HIGH',
        target: 'PATIENT',
      })
    }
    if (missingCoreBackground.length > 0) {
      nextActions.push({
        key: 'COMPLETE_CORE_BACKGROUND',
        label: `Completar antecedentes mínimos: ${missingCoreBackground.join(', ')}.`,
        priority: 'NORMAL',
        target: 'PATIENT',
      })
    }
    if (!hasObjective) {
      nextActions.push({
        key: 'CAPTURE_OBJECTIVE',
        label: 'Agregar examen físico, hallazgos objetivos o resultados relevantes.',
        priority: 'NORMAL',
        target: 'ENCOUNTER',
      })
    }
    if (!hasAssessment) {
      nextActions.push({
        key: 'ADD_ASSESSMENT',
        label: 'Registrar impresión diagnóstica o diagnósticos diferenciales.',
        priority: 'NORMAL',
        target: 'ENCOUNTER',
      })
    }
    if (!hasPlan) {
      nextActions.push({
        key: 'ADD_PLAN',
        label: 'Definir plan, indicaciones, órdenes, medicamentos o seguimiento.',
        priority: 'NORMAL',
        target: 'ENCOUNTER',
      })
    }
    nextActions.push({
      key: 'ASK_CLINICAL_COPILOT',
      label: 'Consultar al copiloto con el historial completo antes de cerrar.',
      priority: 'LOW',
      target: 'AI',
    })
  }

  const readyToClose = Boolean(activeEncounter && hasSubjective && hasObjective && hasAssessment && hasPlan)

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_VIEWED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { view: 'CLINICAL_WORKSPACE', active_encounter_id: activeEncounter?.id },
  })

  return {
    patient,
    workflow: {
      stage: activeEncounter ? getWorkflowStage(activeEncounter.metadata) : 'INTAKE',
      ready_to_close: readyToClose,
      open_encounter_count: openEncounters.length,
    },
    active_encounter: activeEncounter
      ? { ...activeEncounter, treatment_plan: activeEncounterTreatment }
      : null,
    readiness: {
      has_active_encounter: Boolean(activeEncounter),
      has_subjective: hasSubjective,
      has_vitals: Boolean(activeEncounterVital),
      has_objective: hasObjective,
      has_assessment: hasAssessment,
      has_plan: hasPlan,
      missing_core_background: missingCoreBackground,
      latest_encounter_vital_id: activeEncounterVital?.id ?? null,
    },
    context: {
      background,
      problems,
      latest_vitals: latestVitals,
      latest_encounters: latestEncounters,
      treatments,
      pending_review_items: pendingReviewItems,
    },
    next_actions: nextActions,
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updatePatient(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: UpdatePatientInput,
) {
  const existing = await db.query.patients.findFirst({
    where: and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ),
  })

  if (!existing) throw new NotFoundError('Patient')

  // Dedup check on id_number change
  if (input.id_number && input.id_number !== existing.id_number) {
    const duplicate = await db.query.patients.findFirst({
      where: and(
        eq(patients.tenant_id, tenantId),
        eq(patients.id_number, input.id_number),
      ),
      columns: { id: true },
    })

    if (duplicate && duplicate.id !== patientId) {
      throw new ConflictError(
        `Another patient with ID number ${input.id_number} already exists`,
        'PATIENT_DUPLICATE_ID',
      )
    }
  }

  const [updated] = await db
    .update(patients)
    .set({ ...input, updated_at: new Date() })
    .where(and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    changes: { before: existing, after: updated },
  })

  return updated
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivatePatient(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
) {
  const existing = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })

  if (!existing) throw new NotFoundError('Patient')

  await db
    .update(patients)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    changes: { before: { is_active: true }, after: { is_active: false } },
  })
}
