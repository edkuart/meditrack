import { and, eq } from 'drizzle-orm'
import { db, notificationLogs } from '../../shared/db/index.ts'
import { sendEmail } from '../../shared/services/email.service.ts'
import { sendWhatsApp } from '../../shared/services/whatsapp.service.ts'
import { log } from '../../shared/observability/logger.ts'

const PORTAL_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const MAX_NOTIFICATION_ATTEMPTS = 3
const RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000]

type ContactInfo = {
  id: string
  first_name: string
  email: string | null
  phone: string | null
}

type NotificationType = typeof notificationLogs.$inferInsert['type']
type NotificationChannel = typeof notificationLogs.$inferInsert['channel']
type NotificationStatus = typeof notificationLogs.$inferInsert['status']

interface DispatchResult {
  channel: NotificationChannel
  status: Extract<NotificationStatus, 'SENT' | 'FAILED'>
  providerMessageId?: string
  failedReason?: string
  attemptCount: number
  nextRetryAt: Date | null
}

export function nextRetryAt(attemptCount: number, now = new Date()): Date | null {
  if (attemptCount >= MAX_NOTIFICATION_ATTEMPTS) return null
  const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)]
  return new Date(now.getTime() + delay)
}

export function chooseDoseReminderChannels(patient: ContactInfo): NotificationChannel[] {
  const channels: NotificationChannel[] = []
  if (patient.email) channels.push('email')
  if (patient.phone) channels.push('whatsapp')
  return channels
}

export async function getDoseReminderDeliveryState(doseEventId: string, now = new Date()) {
  const latest = await db.query.notificationLogs.findFirst({
    where: and(
      eq(notificationLogs.dose_event_id, doseEventId),
      eq(notificationLogs.type, 'DOSE_REMINDER'),
    ),
    orderBy: (n, { desc }) => desc(n.created_at),
    columns: {
      id: true,
      status: true,
      attempt_count: true,
      next_retry_at: true,
    },
  })

  if (!latest) {
    return { shouldSend: true, reason: 'never_sent', attemptCount: 1 }
  }

  if (latest.status === 'SENT' || latest.status === 'DELIVERED') {
    return { shouldSend: false, reason: 'already_delivered', attemptCount: latest.attempt_count }
  }

  if (latest.attempt_count >= MAX_NOTIFICATION_ATTEMPTS) {
    return { shouldSend: false, reason: 'max_attempts_reached', attemptCount: latest.attempt_count }
  }

  if (latest.next_retry_at && latest.next_retry_at > now) {
    return { shouldSend: false, reason: 'retry_not_due', attemptCount: latest.attempt_count }
  }

  return { shouldSend: true, reason: 'retry_due', attemptCount: latest.attempt_count + 1 }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendMagicLinkNotification(
  patient: ContactInfo & { last_name: string },
  accessUrl: string,
  expiresAt: Date,
  channel: string,
): Promise<void> {
  const expiresStr = expiresAt.toLocaleDateString('es', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  if (channel === 'whatsapp' && patient.phone) {
    const body = `Hola ${patient.first_name} 👋\n\nTu médico ha habilitado tu acceso al portal de salud meditrack.\n\nAccede aquí: ${accessUrl}\n\nEste enlace expira el ${expiresStr}.`
    await dispatchWhatsApp(patient.id, patient.phone, body, 'MAGIC_LINK', undefined, 1)
    return
  }

  if (patient.email) {
    const html = magicLinkHtml(patient.first_name, accessUrl, expiresStr)
    const text = `Hola ${patient.first_name},\n\nTu médico ha habilitado tu acceso al portal meditrack.\n\nAccede aquí: ${accessUrl}\n\nExpira el ${expiresStr}.`
    await dispatchEmail(patient.id, patient.email, 'Acceso a tu portal de salud', html, text, 'MAGIC_LINK', undefined, 1)
  }
}

export async function sendWhatsAppPortalAccessNotification(
  patient: ContactInfo,
  accessUrl: string,
  pin: string,
  expiresAt: Date,
): Promise<DispatchResult> {
  if (!patient.phone) {
    return {
      channel: 'whatsapp',
      status: 'FAILED',
      failedReason: 'Patient has no WhatsApp phone number',
      attemptCount: 1,
      nextRetryAt: null,
    }
  }

  const expiresStr = expiresAt.toLocaleDateString('es', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const pinUrl = `${PORTAL_URL}/portal/auth?patient=${patient.id}`
  const body = `Hola ${patient.first_name} 👋\n\nTu equipo médico ha compartido tu portal de salud meditrack.\n\nEntra directo aquí:\n${accessUrl}\n\nPIN de respaldo: ${pin}\nSi el enlace no abre, usa este acceso:\n${pinUrl}\n\nEste acceso expira el ${expiresStr}.`

  return dispatchWhatsApp(patient.id, patient.phone, body, 'MAGIC_LINK', undefined, 1)
}

export async function sendPinNotification(
  patient: ContactInfo,
  pin: string,
): Promise<void> {
  const portalUrl = `${PORTAL_URL}/portal/auth?patient=${patient.id}`
  const text = `Hola ${patient.first_name} 👋\n\nTu PIN de acceso al portal meditrack es: ${pin}\n\nÚsalo en: ${portalUrl}`

  if (patient.phone) {
    await dispatchWhatsApp(patient.id, patient.phone, text, 'WELCOME', undefined, 1)
    return
  }

  if (patient.email) {
    const html = pinHtml(patient.first_name, pin, portalUrl)
    await dispatchEmail(patient.id, patient.email, 'Tu PIN de acceso a meditrack', html, text, 'WELCOME', undefined, 1)
  }
}

export async function sendDoseReminderNotification(
  patient: ContactInfo,
  doseEventId: string,
  scheduledAt: Date,
  drugName: string,
  doseAmount: number,
  doseUnit: string,
  attemptCount = 1,
): Promise<DispatchResult | null> {
  const time = scheduledAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const portalUrl = `${PORTAL_URL}/portal`
  const text = `💊 Recordatorio: ${patient.first_name}, es hora de tomar ${drugName} (${doseAmount} ${doseUnit}) a las ${time}.\n\nConfírmalo en: ${portalUrl}`
  const channels = chooseDoseReminderChannels(patient)

  for (const channel of channels) {
    const result = channel === 'email'
      ? await dispatchEmail(
        patient.id,
        patient.email!,
        `Recordatorio: ${drugName}`,
        doseReminderHtml(patient.first_name, drugName, `${doseAmount} ${doseUnit}`, time, portalUrl),
        text,
        'DOSE_REMINDER',
        doseEventId,
        attemptCount,
      )
      : await dispatchWhatsApp(patient.id, patient.phone!, text, 'DOSE_REMINDER', doseEventId, attemptCount)

    if (result.status === 'SENT') return result

    log.warn('notification.channel_failed', {
      type: 'DOSE_REMINDER',
      channel,
      patient_id: patient.id,
      dose_event_id: doseEventId,
      attempt_count: attemptCount,
      failed_reason: result.failedReason,
    })
  }

  return null
}

// ─── Channel dispatch + logging ───────────────────────────────────────────────

async function dispatchEmail(
  patientId: string,
  recipient: string,
  subject: string,
  html: string,
  text: string,
  type: string,
  doseEventId: string | undefined,
  attemptCount: number,
): Promise<DispatchResult> {
  let providerMessageId: string | undefined
  let failedReason: string | undefined
  let status: 'SENT' | 'FAILED' = 'SENT'
  const attemptedAt = new Date()

  try {
    providerMessageId = await sendEmail({ to: recipient, subject, html, text })
  } catch (err) {
    status = 'FAILED'
    failedReason = err instanceof Error ? err.message : String(err)
    log.error('notification.email_failed', { patient_id: patientId, dose_event_id: doseEventId, failed_reason: failedReason })
  }

  const retryAt = status === 'FAILED' ? nextRetryAt(attemptCount, attemptedAt) : null

  await db.insert(notificationLogs).values({
    patient_id: patientId,
    dose_event_id: doseEventId ?? null,
    channel: 'email',
    type: type as typeof notificationLogs.$inferInsert['type'],
    status,
    recipient,
    provider_message_id: providerMessageId,
    content_snapshot: { subject, preview: text.slice(0, 300) },
    attempt_count: attemptCount,
    last_attempt_at: attemptedAt,
    next_retry_at: retryAt,
    sent_at: status === 'SENT' ? new Date() : null,
    failed_reason: failedReason ?? null,
  }).catch(err => log.error('notification.log_failed', { error: err instanceof Error ? err.message : String(err) }))

  return {
    channel: 'email',
    status,
    providerMessageId,
    failedReason,
    attemptCount,
    nextRetryAt: retryAt,
  }
}

async function dispatchWhatsApp(
  patientId: string,
  phone: string,
  body: string,
  type: string,
  doseEventId: string | undefined,
  attemptCount: number,
): Promise<DispatchResult> {
  let providerMessageId: string | undefined
  let failedReason: string | undefined
  let status: 'SENT' | 'FAILED' = 'SENT'
  const attemptedAt = new Date()

  try {
    providerMessageId = await sendWhatsApp(phone, body)
  } catch (err) {
    status = 'FAILED'
    failedReason = err instanceof Error ? err.message : String(err)
    log.error('notification.whatsapp_failed', { patient_id: patientId, dose_event_id: doseEventId, failed_reason: failedReason })
  }

  const retryAt = status === 'FAILED' ? nextRetryAt(attemptCount, attemptedAt) : null

  await db.insert(notificationLogs).values({
    patient_id: patientId,
    dose_event_id: doseEventId ?? null,
    channel: 'whatsapp',
    type: type as typeof notificationLogs.$inferInsert['type'],
    status,
    recipient: phone,
    provider_message_id: providerMessageId,
    content_snapshot: { body: body.slice(0, 300) },
    attempt_count: attemptCount,
    last_attempt_at: attemptedAt,
    next_retry_at: retryAt,
    sent_at: status === 'SENT' ? new Date() : null,
    failed_reason: failedReason ?? null,
  }).catch(err => log.error('notification.log_failed', { error: err instanceof Error ? err.message : String(err) }))

  return {
    channel: 'whatsapp',
    status,
    providerMessageId,
    failedReason,
    attemptCount,
    nextRetryAt: retryAt,
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">meditrack</p>
    </div>
    <div style="padding:32px">${content}</div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">Correo generado automáticamente — no respondas a este mensaje.</p>
    </div>
  </div>
</body></html>`
}

export function magicLinkHtml(firstName: string, url: string, expiresStr: string): string {
  return baseHtml(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Acceso a tu portal de salud</h2>
    <p style="margin:0 0 8px;color:#475569">Hola <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569">Tu médico ha habilitado tu acceso al portal de salud meditrack. Aquí puedes ver tus medicamentos y confirmar que los tomaste.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
        Acceder al portal →
      </a>
    </div>
    <p style="margin:0;font-size:13px;color:#94a3b8">Este enlace expira el <strong>${expiresStr}</strong>. Si no esperabas este correo, ignóralo.</p>
  `)
}

export function pinHtml(firstName: string, pin: string, portalUrl: string): string {
  return baseHtml(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Tu PIN de acceso a meditrack</h2>
    <p style="margin:0 0 8px;color:#475569">Hola <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569">Tu médico te ha asignado un PIN para acceder a tu portal de salud.</p>
    <div style="background:#f0f7ff;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">Tu PIN de acceso</p>
      <p style="margin:0;color:#2563eb;font-size:36px;font-weight:700;letter-spacing:8px">${pin}</p>
    </div>
    <div style="text-align:center">
      <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
        Ir al portal →
      </a>
    </div>
  `)
}

export function doseReminderHtml(
  firstName: string,
  drugName: string,
  dose: string,
  time: string,
  portalUrl: string,
): string {
  return baseHtml(`
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:22px">Recordatorio de medicamento</h2>
    <p style="margin:0 0 8px;color:#475569">Hola <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569">Es hora de tomar tu medicamento programado.</p>
    <div style="background:#f0f7ff;border-radius:12px;padding:20px;margin:24px 0">
      <p style="margin:0 0 4px;color:#1e293b;font-size:18px;font-weight:700">💊 ${drugName}</p>
      <p style="margin:0;color:#64748b">${dose} — programado a las <strong>${time}</strong></p>
    </div>
    <p style="margin:0 0 24px;color:#475569">Una vez que lo tomes, recuerda confirmarlo en tu portal.</p>
    <div style="text-align:center">
      <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
        Confirmar que lo tomé →
      </a>
    </div>
  `)
}
