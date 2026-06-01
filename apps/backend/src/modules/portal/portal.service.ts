import { eq, and, desc, lte, gte, lt, count, sql, gte as gteOp } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import {
  db, patients, patientAccessTokens, encounters,
  treatmentPlans, medicationItems, doseEvents, documents, patientCheckIns,
  labOrders, treatmentInterventions, appointments, doctorNotifications,
} from '../../shared/db/index.ts'
import {
  generateOpaqueToken, generatePin, hashToken,
  signPatientToken, verifyPatientToken,
} from '../../shared/services/token.service.ts'
import { getSignedViewUrl, uploadFile, buildStorageKey } from '../../shared/storage/storage.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { UnauthorizedError, NotFoundError, AppError } from '../../shared/errors.ts'
import {
  sendMagicLinkNotification,
  sendPinNotification,
  sendWhatsAppPortalAccessNotification,
} from '../notifications/notifications.service.ts'
import { buildEngagementProfile } from './engagement.ts'
import { createDoctorNotification } from '../doctor-notifications/doctor-notifications.service.ts'
import type { GenerateAccessInput, PatientCheckInInput, ValidatePinInput } from './portal.schema.ts'

// ─── Doctor: generate patient access ──────────────────────────────────────────

export async function generatePatientAccess(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  patientId: string,
  input: GenerateAccessInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true, first_name: true, last_name: true, email: true, phone: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + input.expires_in_days)

  if (input.channel === 'whatsapp' && !patient.phone) {
    throw new AppError(422, 'PATIENT_PHONE_REQUIRED', 'Patient does not have a WhatsApp phone number')
  }

  let rawToken: string
  let tokenHash: string
  let pinPlain: string | undefined

  if (input.channel === 'pin' || input.channel === 'whatsapp') {
    pinPlain = generatePin()
  }

  if (input.channel === 'pin') {
    pinPlain = pinPlain ?? generatePin()
    // Store bcrypt hash of PIN — never the plain PIN
    tokenHash = await bcrypt.hash(pinPlain, 10)
    rawToken = pinPlain
  } else {
    rawToken = generateOpaqueToken()
    tokenHash = hashToken(rawToken)
  }

  const [accessToken] = await db.insert(patientAccessTokens).values({
    patient_id: patientId,
    token_hash: tokenHash,
    channel: input.channel,
    expires_at: expiresAt,
    created_by: doctorId,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'TOKEN_GENERATED',
    resource_type: 'PATIENT_ACCESS_TOKEN',
    resource_id: accessToken.id,
    context: { patient_id: patientId, channel: input.channel },
  })

  // Build the access URL / data to return to the doctor
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'

  if (input.channel === 'pin') {
    // Fire-and-forget: notify patient via email or WhatsApp with their PIN
    if (pinPlain) {
      sendPinNotification(patient, pinPlain).catch(err =>
        console.error('[portal] PIN notification error:', err)
      )
    }
    return {
      channel: 'pin',
      pin: pinPlain,
      patient_id: patientId,
      access_url: `${frontendUrl}/portal`,
      expires_at: expiresAt,
    }
  }

  const accessUrl = `${frontendUrl}/portal?token=${rawToken}&fresh=1`

  if (input.channel === 'whatsapp' && pinPlain) {
    const pinHash = await bcrypt.hash(pinPlain, 10)
    const [pinToken] = await db.insert(patientAccessTokens).values({
      patient_id: patientId,
      token_hash: pinHash,
      channel: 'pin',
      expires_at: expiresAt,
      created_by: doctorId,
    }).returning()

    await createAuditLog({
      tenant_id: tenantId,
      actor_id: doctorId,
      actor_type: 'USER',
      actor_email: doctorEmail,
      action: 'TOKEN_GENERATED',
      resource_type: 'PATIENT_ACCESS_TOKEN',
      resource_id: pinToken.id,
      context: { patient_id: patientId, channel: 'pin', paired_channel: 'whatsapp' },
    })

    const delivery = await sendWhatsAppPortalAccessNotification(patient, accessUrl, pinPlain, expiresAt)
    if (delivery.status === 'FAILED') {
      throw new AppError(500, 'WHATSAPP_SEND_FAILED', delivery.failedReason ?? 'Could not send WhatsApp access message')
    }

    return {
      channel: input.channel,
      token: rawToken,
      pin: pinPlain,
      access_url: accessUrl,
      qr_data: accessUrl,
      expires_at: expiresAt,
    }
  }

  // Fire-and-forget: send magic link or WhatsApp to patient
  if (input.channel !== 'qr') {
    sendMagicLinkNotification(patient, accessUrl, expiresAt, input.channel).catch(err =>
      console.error('[portal] access notification error:', err)
    )
  }

  return {
    channel: input.channel,
    token: rawToken,
    access_url: accessUrl,
    qr_data: accessUrl,
    expires_at: expiresAt,
  }
}

// ─── Doctor: revoke patient access ────────────────────────────────────────────

export async function revokePatientAccess(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  patientId: string,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  await db
    .update(patientAccessTokens)
    .set({ revoked_at: new Date() })
    .where(eq(patientAccessTokens.patient_id, patientId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'TOKEN_REVOKED',
    resource_type: 'PATIENT_ACCESS_TOKEN',
    context: { patient_id: patientId },
  })
}

// ─── Patient: validate magic link / QR token ──────────────────────────────────

export async function validateMagicLink(rawToken: string, ip?: string) {
  const tokenHash = hashToken(rawToken)

  const accessToken = await db.query.patientAccessTokens.findFirst({
    where: eq(patientAccessTokens.token_hash, tokenHash),
    with: {
      patient: {
        columns: { id: true, tenant_id: true, first_name: true, last_name: true, is_active: true },
      },
    },
  })

  if (!accessToken) throw new UnauthorizedError('Invalid or expired access link', 'INVALID_TOKEN')
  if (accessToken.revoked_at) throw new UnauthorizedError('This access link has been revoked', 'TOKEN_REVOKED')
  if (accessToken.expires_at < new Date()) throw new UnauthorizedError('This access link has expired', 'TOKEN_EXPIRED')
  if (!accessToken.patient.is_active) throw new UnauthorizedError('Patient account is inactive')

  // Mark as used (but keep valid for subsequent logins)
  if (!accessToken.used_at) {
    await db
      .update(patientAccessTokens)
      .set({ used_at: new Date() })
      .where(eq(patientAccessTokens.id, accessToken.id))
  }

  const sessionToken = await signPatientToken({
    sub: accessToken.patient.id,
    tenant_id: accessToken.patient.tenant_id,
    type: 'PATIENT',
    access_token_id: accessToken.id,
  })

  await createAuditLog({
    tenant_id: accessToken.patient.tenant_id,
    actor_id: accessToken.patient.id,
    actor_type: 'PATIENT',
    action: 'TOKEN_USED',
    resource_type: 'PATIENT_ACCESS_TOKEN',
    resource_id: accessToken.id,
    ip_address: ip,
    context: { channel: accessToken.channel },
  })

  return {
    session_token: sessionToken,
    patient: {
      id: accessToken.patient.id,
      first_name: accessToken.patient.first_name,
      last_name: accessToken.patient.last_name,
    },
  }
}

// ─── Patient: validate PIN ────────────────────────────────────────────────────

export async function validatePin(input: ValidatePinInput, ip?: string) {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, input.patient_id),
    columns: { id: true, tenant_id: true, first_name: true, last_name: true, is_active: true, access_pin_hash: true },
  })

  if (!patient?.is_active) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

  // Find the most recent active PIN token for this patient
  const pinToken = await db.query.patientAccessTokens.findFirst({
    where: and(
      eq(patientAccessTokens.patient_id, input.patient_id),
      eq(patientAccessTokens.channel, 'pin'),
    ),
    orderBy: (t, { desc }) => desc(t.created_at),
  })

  if (!pinToken || pinToken.revoked_at || pinToken.expires_at < new Date()) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')
  }

  const valid = await bcrypt.compare(input.pin, pinToken.token_hash)
  if (!valid) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')

  const sessionToken = await signPatientToken({
    sub: patient.id,
    tenant_id: patient.tenant_id,
    type: 'PATIENT',
    access_token_id: pinToken.id,
  })

  await createAuditLog({
    tenant_id: patient.tenant_id,
    actor_id: patient.id,
    actor_type: 'PATIENT',
    action: 'TOKEN_USED',
    resource_type: 'PATIENT_ACCESS_TOKEN',
    resource_id: pinToken.id,
    ip_address: ip,
    context: { channel: 'pin' },
  })

  return {
    session_token: sessionToken,
    patient: { id: patient.id, first_name: patient.first_name, last_name: patient.last_name },
  }
}

// ─── Portal data (patient-facing) ─────────────────────────────────────────────

export async function getPortalMe(patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, patientId),
    columns: {
      id: true, first_name: true, last_name: true,
      date_of_birth: true, sex: true,
    },
  })
  if (!patient) throw new NotFoundError('Patient')
  return patient
}

export async function getActiveTreatment(patientId: string) {
  const plans = await getActiveTreatments(patientId)
  return plans[0] ?? null
}

export async function getActiveTreatments(patientId: string) {
  const plans = await db.query.treatmentPlans.findMany({
    where: and(
      eq(treatmentPlans.patient_id, patientId),
      eq(treatmentPlans.status, 'ACTIVE'),
    ),
    with: {
      medications: {
        where: eq(medicationItems.is_active, true),
        orderBy: (m, { asc }) => asc(m.sort_order),
      },
      interventions: {
        where: eq(treatmentInterventions.is_active, true),
        orderBy: (iv, { asc }) => asc(iv.sort_order),
      },
    },
    orderBy: (t, { desc }) => desc(t.created_at),
  })
  return plans
}

export async function getTodayDosesForPortal(patientId: string) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  return db.query.doseEvents.findMany({
    where: and(
      eq(doseEvents.patient_id, patientId),
      gte(doseEvents.scheduled_at, todayStart),
      lte(doseEvents.scheduled_at, todayEnd),
    ),
    with: {
      medication_item: {
        columns: {
          drug_name: true, presentation: true,
          dose_amount: true, dose_unit: true,
          with_food: true, special_instructions: true,
        },
      },
    },
    orderBy: (d, { asc }) => asc(d.scheduled_at),
  })
}

function formatCheckInDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function severityForCheckIn(input: PatientCheckInInput) {
  const pain = input.pain_score ?? null
  const temperature = input.temperature_c ?? null
  const hasRedFlags = input.red_flags.length > 0
  const highPain = typeof pain === 'number' && pain >= 8
  const fever = typeof temperature === 'number' && temperature >= 38
  const noMeds = input.adherence_self_report === 'none'
  const severeSideEffects = (input.side_effects ?? []).length >= 3

  if (hasRedFlags || highPain || fever || noMeds || input.medication_issue) return 'ALERT' as const
  if (
    (typeof pain === 'number' && pain >= 4) ||
    input.symptoms.length > 0 ||
    (input.side_effects ?? []).length > 0 ||
    severeSideEffects ||
    input.mood === 'worse' ||
    input.adherence_self_report === 'some' ||
    input.treatment_perception === 'worse' ||
    input.energy_level === 'low'
  ) return 'WATCH' as const
  return 'OK' as const
}

export async function getTodayCheckInForPortal(patientId: string) {
  return db.query.patientCheckIns.findFirst({
    where: and(
      eq(patientCheckIns.patient_id, patientId),
      eq(patientCheckIns.check_in_date, formatCheckInDate(new Date())),
    ),
  })
}

export async function submitPatientCheckIn(
  patientId: string,
  tenantId: string,
  input: PatientCheckInInput,
) {
  const checkInDate = formatCheckInDate(new Date())
  const severity = severityForCheckIn(input)
  const values = {
    tenant_id: tenantId,
    patient_id: patientId,
    check_in_date: checkInDate,
    pain_score: input.pain_score ?? null,
    temperature_c: input.temperature_c ?? null,
    symptoms: input.symptoms,
    side_effects: input.side_effects ?? [],
    red_flags: input.red_flags,
    medication_issue: input.medication_issue || input.adherence_self_report === 'none' || input.adherence_self_report === 'some',
    adherence_self_report: input.adherence_self_report ?? null,
    adherence_skip_reason: input.adherence_skip_reason?.trim() || null,
    energy_level: input.energy_level ?? null,
    sleep_quality: input.sleep_quality ?? null,
    treatment_perception: input.treatment_perception ?? null,
    mood: input.mood ?? null,
    notes: input.notes?.trim() || null,
    severity,
    updated_at: new Date(),
  }

  const existing = await db.query.patientCheckIns.findFirst({
    where: and(eq(patientCheckIns.patient_id, patientId), eq(patientCheckIns.check_in_date, checkInDate)),
    columns: { id: true },
  })

  const [checkIn] = existing
    ? await db
        .update(patientCheckIns)
        .set(values)
        .where(eq(patientCheckIns.id, existing.id))
        .returning()
    : await db
        .insert(patientCheckIns)
        .values(values)
        .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: patientId,
    actor_type: 'PATIENT',
    action: 'CHECK_IN_SUBMITTED',
    resource_type: 'PATIENT_CHECK_IN',
    resource_id: checkIn.id,
    context: { patient_id: patientId, severity },
  })

  // Notify treating doctor only for ALERT severity (anti-fatigue: max 1 per patient per day)
  if (severity === 'ALERT') {
    try {
      const [patient, lastEnc] = await Promise.all([
        db.query.patients.findFirst({
          where: eq(patients.id, patientId),
          columns: { first_name: true, last_name: true },
        }),
        db.query.encounters.findFirst({
          where: and(eq(encounters.patient_id, patientId), eq(encounters.tenant_id, tenantId)),
          orderBy: (e, { desc: d }) => d(e.created_at),
          columns: { doctor_id: true },
        }),
      ])

      if (lastEnc?.doctor_id && patient) {
        // De-dup: skip if ALERT already sent today for this patient
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const recentAlert = await db.query.doctorNotifications.findFirst({
          where: and(
            eq(doctorNotifications.patient_id, patientId),
            eq(doctorNotifications.recipient_id, lastEnc.doctor_id),
            eq(doctorNotifications.type, 'PATIENT_CHECKIN_ALERT'),
            gteOp(doctorNotifications.created_at, todayStart),
          ),
          columns: { id: true },
        })

        if (!recentAlert) {
          const patientName = `${patient.first_name} ${patient.last_name}`
          const reasons: string[] = []
          if ((input.red_flags ?? []).length > 0) reasons.push(`señales de alarma: ${input.red_flags.join(', ')}`)
          if (typeof input.pain_score === 'number' && input.pain_score >= 8) reasons.push(`dolor ${input.pain_score}/10`)
          if (typeof input.temperature_c === 'number' && input.temperature_c >= 38) reasons.push(`fiebre ${input.temperature_c}°C`)
          if (input.adherence_self_report === 'none') reasons.push('no tomó ningún medicamento')

          await createDoctorNotification({
            tenant_id:    tenantId,
            recipient_id: lastEnc.doctor_id,
            patient_id:   patientId,
            type:         'PATIENT_CHECKIN_ALERT',
            title:        `⚠️ Revisión necesaria: ${patientName}`,
            body:         reasons.length > 0
              ? `Reporte de hoy: ${reasons.join('; ')}.`
              : 'El paciente reportó una señal de alerta en su check-in de hoy.',
            metadata: {
              severity,
              check_in_id:          checkIn.id,
              pain_score:           input.pain_score ?? null,
              temperature_c:        input.temperature_c ?? null,
              red_flags:            input.red_flags,
              adherence_self_report:input.adherence_self_report ?? null,
              medication_issue:     input.medication_issue,
            },
          })
        }
      }
    } catch { /* notification failure must not affect check-in save */ }
  }

  return checkIn
}

export async function confirmDoseAsPatient(
  patientId: string,
  tenantId: string,
  doseEventId: string,
  notes?: string,
) {
  const event = await db.query.doseEvents.findFirst({
    where: and(eq(doseEvents.id, doseEventId), eq(doseEvents.patient_id, patientId)),
  })

  if (!event) throw new NotFoundError('Dose event')
  if (event.status === 'CONFIRMED') throw new AppError(409, 'ALREADY_CONFIRMED', 'Dose already confirmed')

  if (new Date() > event.can_edit_until) {
    throw new AppError(403, 'DOSE_CONFIRMATION_WINDOW_EXPIRED',
      'The 24-hour confirmation window has passed',
      { expired_at: event.can_edit_until },
    )
  }

  const [confirmed] = await db
    .update(doseEvents)
    .set({ status: 'CONFIRMED', confirmed_at: new Date(), confirmation_channel: 'portal', notes })
    .where(eq(doseEvents.id, doseEventId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: patientId,
    actor_type: 'PATIENT',
    action: 'DOSE_CONFIRMED',
    resource_type: 'DOSE_EVENT',
    resource_id: doseEventId,
    changes: { before: { status: 'PENDING' }, after: { status: 'CONFIRMED' } },
  })

  return confirmed
}

export async function getPatientHistory(patientId: string) {
  return db.query.encounters.findMany({
    where: eq(encounters.patient_id, patientId),
    columns: {
      id: true, encounter_type: true, status: true,
      chief_complaint: true, summary: true,
      opened_at: true, closed_at: true,
    },
    with: {
      doctor: { columns: { first_name: true, last_name: true, specialty: true } },
    },
    orderBy: (e, { desc }) => desc(e.opened_at),
    limit: 20,
  })
}

export async function getEncounterDetailForPortal(patientId: string, encounterId: string) {
  const enc = await db.query.encounters.findFirst({
    where: and(eq(encounters.id, encounterId), eq(encounters.patient_id, patientId)),
    columns: {
      id: true, encounter_type: true, status: true,
      chief_complaint: true, subjective: true, objective: true,
      assessment: true, plan: true, summary: true,
      opened_at: true, closed_at: true,
    },
    with: {
      doctor: { columns: { first_name: true, last_name: true, specialty: true } },
    },
  })
  if (!enc) throw new NotFoundError('Encounter')
  return enc
}

export async function getPatientDocuments(patientId: string) {
  return db.query.documents.findMany({
    where: and(
      eq(documents.patient_id, patientId),
      eq(documents.is_visible_to_patient, true),
    ),
    columns: {
      id: true, type: true, file_name: true,
      mime_type: true, created_at: true,
    },
    orderBy: (d, { desc }) => desc(d.created_at),
    limit: 50,
  })
}

export async function getLabOrdersForPortal(patientId: string, tenantId: string) {
  return db.query.labOrders.findMany({
    where: and(
      eq(labOrders.tenant_id, tenantId),
      eq(labOrders.patient_id, patientId),
    ),
    columns: {
      id: true,
      status: true,
      notes: true,
      ordered_at: true,
      updated_at: true,
    },
    with: {
      doctor: {
        columns: { first_name: true, last_name: true, specialty: true },
      },
      results: {
        columns: {
          id: true,
          panel_name: true,
          parameter_name: true,
          value: true,
          unit: true,
          status: true,
          sort_order: true,
        },
        orderBy: (r, { asc }) => asc(r.sort_order),
      },
    },
    orderBy: (order, { desc }) => desc(order.ordered_at),
    limit: 5,
  })
}

export async function getLabOrderForPortal(patientId: string, tenantId: string, orderId: string) {
  const order = await db.query.labOrders.findFirst({
    where: and(
      eq(labOrders.tenant_id, tenantId),
      eq(labOrders.patient_id, patientId),
      eq(labOrders.id, orderId),
    ),
    columns: { id: true, status: true, notes: true, ordered_at: true, updated_at: true },
    with: {
      doctor: { columns: { first_name: true, last_name: true, specialty: true } },
      results: {
        columns: {
          id: true, panel_name: true, parameter_name: true,
          value: true, numeric_value: true, unit: true,
          ref_min: true, ref_max: true, ref_text: true,
          status: true, sort_order: true,
        },
        orderBy: (r, { asc }) => asc(r.sort_order),
      },
    },
  })
  if (!order) throw new NotFoundError('LabOrder')
  return order
}

export async function getPortalAppointments(patientId: string, tenantId: string) {
  const now = new Date()

  const [upcoming, past] = await Promise.all([
    db.query.appointments.findMany({
      where: and(
        eq(appointments.patient_id, patientId),
        eq(appointments.tenant_id, tenantId),
        gte(appointments.scheduled_at, now),
      ),
      with: {
        doctor: { columns: { first_name: true, last_name: true, specialty: true } },
        location: { columns: { name: true, address: true } },
      },
      orderBy: (a, { asc }) => asc(a.scheduled_at),
      limit: 10,
    }),
    db.query.appointments.findMany({
      where: and(
        eq(appointments.patient_id, patientId),
        eq(appointments.tenant_id, tenantId),
        lt(appointments.scheduled_at, now),
      ),
      with: {
        doctor: { columns: { first_name: true, last_name: true, specialty: true } },
        location: { columns: { name: true, address: true } },
      },
      orderBy: (a, { desc }) => desc(a.scheduled_at),
      limit: 5,
    }),
  ])

  return { upcoming, past }
}

export async function cancelAppointmentFromPortal(patientId: string, tenantId: string, appointmentId: string, reason: string) {
  const appt = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.id, appointmentId),
      eq(appointments.patient_id, patientId),
      eq(appointments.tenant_id, tenantId),
    ),
    columns: { id: true, status: true, scheduled_at: true, doctor_id: true, type: true },
    with: {
      patient: { columns: { first_name: true, last_name: true } },
    },
  })

  if (!appt) throw new NotFoundError('Appointment')

  if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED' || appt.status === 'NO_SHOW') {
    throw new AppError(409, 'APPOINTMENT_NOT_CANCELLABLE', 'Esta cita no puede ser cancelada en su estado actual')
  }

  // Guardrail: only allow cancellation ≥24h before scheduled time
  const hoursUntil = (new Date(appt.scheduled_at).getTime() - Date.now()) / 3600000
  if (hoursUntil < 24) {
    throw new AppError(403, 'CANCELLATION_WINDOW_CLOSED',
      'Solo puedes cancelar con al menos 24 horas de anticipación. Contacta al consultorio directamente.',
      { hours_remaining: Math.round(hoursUntil) },
    )
  }

  const [updated] = await db
    .update(appointments)
    .set({ status: 'CANCELLED', cancelled_reason: reason, updated_at: new Date() })
    .where(eq(appointments.id, appointmentId))
    .returning()

  // Notify assigned doctor — cancellation frees a slot and is operationally important
  if (appt.doctor_id && appt.patient) {
    const patientName = `${appt.patient.first_name} ${appt.patient.last_name}`
    const dateStr = new Date(appt.scheduled_at).toLocaleString('es', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    try {
      await createDoctorNotification({
        tenant_id:    tenantId,
        recipient_id: appt.doctor_id,
        patient_id:   patientId,
        type:         'APPOINTMENT_CANCELLED',
        title:        `${patientName} canceló su cita`,
        body:         `Cita del ${dateStr} fue cancelada. Motivo: ${reason || 'sin motivo especificado'}.`,
        metadata: {
          appointment_id: appointmentId,
          scheduled_at:   appt.scheduled_at,
          appointment_type: appt.type,
          cancelled_reason: reason,
        },
      })
    } catch { /* push failure must not block */ }
  }

  return updated
}

export async function confirmAppointmentAttendance(patientId: string, tenantId: string, appointmentId: string) {
  const appt = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.id, appointmentId),
      eq(appointments.patient_id, patientId),
      eq(appointments.tenant_id, tenantId),
    ),
    columns: { id: true, status: true, doctor_id: true, scheduled_at: true, type: true },
    with: {
      patient: { columns: { first_name: true, last_name: true } },
    },
  })

  if (!appt) throw new NotFoundError('Appointment')
  if (appt.status !== 'SCHEDULED') {
    throw new AppError(409, 'APPOINTMENT_STATUS_CONFLICT', 'Solo se pueden confirmar citas en estado SCHEDULED')
  }

  const [updated] = await db
    .update(appointments)
    .set({ status: 'CONFIRMED', updated_at: new Date() })
    .where(eq(appointments.id, appointmentId))
    .returning()

  // In-app feed entry for the doctor — confirmation is informational, no push needed
  if (appt.doctor_id && appt.patient) {
    const patientName = `${appt.patient.first_name} ${appt.patient.last_name}`
    const timeStr = new Date(appt.scheduled_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
    const dateStr = new Date(appt.scheduled_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
    try {
      await createDoctorNotification({
        tenant_id:    tenantId,
        recipient_id: appt.doctor_id,
        patient_id:   patientId,
        type:         'APPOINTMENT_CONFIRMED',
        title:        `${patientName} confirmó asistencia`,
        body:         `Confirmó la cita del ${dateStr} a las ${timeStr}.`,
        metadata: {
          appointment_id:   appointmentId,
          scheduled_at:     appt.scheduled_at,
          appointment_type: appt.type,
        },
      })
    } catch { /* push failure must not block */ }
  }

  return updated
}

export async function getDocumentUrlForPatient(patientId: string, documentId: string) {
  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, documentId),
      eq(documents.patient_id, patientId),
      eq(documents.is_visible_to_patient, true),
    ),
    columns: { id: true, storage_key: true, file_name: true, mime_type: true },
  })
  if (!doc) throw new NotFoundError('Document')

  const url = await getSignedViewUrl(doc.storage_key, 900)
  return { url, expires_in_seconds: 900, file_name: doc.file_name, mime_type: doc.mime_type }
}

export async function getAdherenceForPortal(patientId: string) {
  const todayStart = new Date()
  todayStart.setDate(todayStart.getDate() - 7)

  const rows = await db
    .select({
      status: doseEvents.status,
      cnt: count(doseEvents.id),
    })
    .from(doseEvents)
    .where(and(
      eq(doseEvents.patient_id, patientId),
      gte(doseEvents.scheduled_at, todayStart),
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
  const score = total > 0 ? Math.round((confirmed / total) * 100) : 100

  // Map score to avatar state
  const avatarState =
    score >= 85 ? 'EXCELLENT' :
    score >= 70 ? 'GOOD' :
    score >= 40 ? 'FAIR' : 'POOR'

  return { score, confirmed, total, missed: total - confirmed, avatar_state: avatarState }
}

export async function getEngagementForPortal(patientId: string) {
  const since = new Date()
  since.setDate(since.getDate() - 6)
  since.setHours(0, 0, 0, 0)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [weekRows, todayDoses] = await Promise.all([
    db
      .select({
        date: sql<string>`DATE(${doseEvents.scheduled_at})::text`,
        status: doseEvents.status,
        cnt: count(doseEvents.id),
      })
      .from(doseEvents)
      .where(and(
        eq(doseEvents.patient_id, patientId),
        gte(doseEvents.scheduled_at, since),
        lte(doseEvents.scheduled_at, new Date()),
      ))
      .groupBy(sql`DATE(${doseEvents.scheduled_at})`, doseEvents.status),
    db.query.doseEvents.findMany({
      where: and(
        eq(doseEvents.patient_id, patientId),
        gte(doseEvents.scheduled_at, todayStart),
        lte(doseEvents.scheduled_at, todayEnd),
      ),
      columns: {
        id: true,
        scheduled_at: true,
        status: true,
      },
      with: {
        medication_item: {
          columns: { drug_name: true },
        },
      },
      orderBy: (d, { asc }) => asc(d.scheduled_at),
    }),
  ])

  const actionableToday = todayDoses.filter(dose =>
    dose.status !== 'CANCELLED' && dose.status !== 'SUPERSEDED',
  )
  const nextDose = actionableToday.find(dose => dose.status === 'PENDING')

  return buildEngagementProfile(
    weekRows.map(row => ({ date: row.date, status: row.status, cnt: Number(row.cnt) })),
    {
      total: actionableToday.length,
      confirmed: actionableToday.filter(dose => dose.status === 'CONFIRMED').length,
      pending: actionableToday.filter(dose => dose.status === 'PENDING').length,
      next_dose_at: nextDose?.scheduled_at.toISOString() ?? null,
      next_dose_name: nextDose?.medication_item.drug_name ?? null,
    },
  )
}

// ─── Patient uploads a document from their portal ─────────────────────────────

const ALLOWED_PORTAL_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
const MAX_PORTAL_DOC_BYTES = 20 * 1024 * 1024 // 20 MB

export async function uploadPatientDocument(
  patientId: string,
  tenantId: string,
  file: File,
  docType: string,
  note: string,
) {
  if (!ALLOWED_PORTAL_MIME.includes(file.type as typeof ALLOWED_PORTAL_MIME[number])) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Tipo de archivo no permitido. Solo PDF, JPEG, PNG o WEBP.')
  }
  if (file.size > MAX_PORTAL_DOC_BYTES) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El archivo supera el límite de 20 MB.')
  }

  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
    columns: { id: true, first_name: true, last_name: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const buffer = Buffer.from(await file.arrayBuffer())
  const { createHash } = await import('crypto')
  const checksum = createHash('sha256').update(buffer).digest('hex')

  type DocumentType = 'PRESCRIPTION' | 'LAB_RESULT' | 'IMAGING' | 'CONSENT' | 'CLINICAL_NOTE' | 'OTHER'
  const VALID_DOC_TYPES: DocumentType[] = ['PRESCRIPTION', 'LAB_RESULT', 'IMAGING', 'CONSENT', 'CLINICAL_NOTE', 'OTHER']
  const safeType: DocumentType = VALID_DOC_TYPES.includes(docType as DocumentType)
    ? (docType as DocumentType)
    : 'OTHER'

  const [doc] = await db.insert(documents).values({
    tenant_id:            tenantId,
    patient_id:           patientId,
    uploaded_by:          null, // patient uploads have no staff uploader
    type:                 safeType,
    file_name:            file.name,
    file_size:            file.size,
    mime_type:            file.type,
    storage_key:          'pending',
    checksum,
    is_visible_to_patient: true,
  }).returning()

  const storageKey = buildStorageKey(tenantId, patientId, doc.id, file.name)
  await uploadFile(storageKey, buffer, file.type)
  await db.update(documents).set({ storage_key: storageKey }).where(eq(documents.id, doc.id))

  // Notify treating doctor — find doctor from most recent encounter
  try {
    const lastEnc = await db.query.encounters.findFirst({
      where: and(eq(encounters.patient_id, patientId), eq(encounters.tenant_id, tenantId)),
      orderBy: (e, { desc }) => desc(e.created_at),
      columns: { doctor_id: true },
    })

    if (lastEnc?.doctor_id) {
      const patientName = `${patient.first_name} ${patient.last_name}`
      const typeLabel: Record<string, string> = {
        LAB_RESULT:    'resultado de laboratorio',
        IMAGING:       'imagen diagnóstica',
        PRESCRIPTION:  'receta',
        CLINICAL_NOTE: 'nota clínica',
        CONSENT:       'consentimiento',
        OTHER:         'documento',
      }
      const label = typeLabel[docType] ?? 'documento'

      await createDoctorNotification({
        tenant_id:    tenantId,
        recipient_id: lastEnc.doctor_id,
        patient_id:   patientId,
        type:         'DOCUMENT_UPLOADED',
        title:        `${patientName} compartió un ${label}`,
        body:         note || `El paciente subió "${file.name}" desde su portal.`,
        metadata: {
          document_id:   doc.id,
          document_type: docType,
          file_name:     file.name,
          mime_type:     file.type,
          note,
        },
      })
    }
  } catch { /* notification failure must not block the upload */ }

  return { id: doc.id, type: docType, file_name: file.name, mime_type: file.type, created_at: doc.created_at }
}
