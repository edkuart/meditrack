import { eq, and, desc, lte, gte, count, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import {
  db, patients, patientAccessTokens, encounters,
  treatmentPlans, medicationItems, doseEvents, documents,
} from '../../shared/db/index.ts'
import {
  generateOpaqueToken, generatePin, hashToken,
  signPatientToken, verifyPatientToken,
} from '../../shared/services/token.service.ts'
import { getSignedViewUrl } from '../../shared/storage/storage.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { UnauthorizedError, NotFoundError, AppError } from '../../shared/errors.ts'
import {
  sendMagicLinkNotification,
  sendPinNotification,
  sendWhatsAppPortalAccessNotification,
} from '../notifications/notifications.service.ts'
import { buildEngagementProfile } from './engagement.ts'
import type { GenerateAccessInput, ValidatePinInput } from './portal.schema.ts'

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
