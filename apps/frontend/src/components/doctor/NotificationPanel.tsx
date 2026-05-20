'use client'

import { AlertCircle, CheckCircle, Clock, Mail, MessageCircle, RefreshCw, X, ArrowUpDown, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import type { NotificationEntry, NotificationStatus, NotificationChannel } from '@/lib/doctor/notifications-api'
import type { DoctorNotification, DoctorNotifType } from '@/lib/doctor/referral-notifications-api'

// ─── Patient notification labels ──────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  DOSE_REMINDER:      'Recordatorio de dosis',
  DOSE_MISSED:        'Dosis perdida',
  TREATMENT_STARTING: 'Tratamiento iniciado',
  TREATMENT_ENDING:   'Tratamiento por terminar',
  APPOINTMENT:        'Cita médica',
  WELCOME:            'Bienvenida al portal',
  MAGIC_LINK:         'Acceso al portal',
}

const STATUS_CONFIG: Record<NotificationStatus, { bg: string; fg: string; label: string; icon: typeof CheckCircle }> = {
  SENT:      { bg: '#ecfdf5', fg: '#047857', label: 'Enviado',   icon: CheckCircle },
  DELIVERED: { bg: '#ecfdf5', fg: '#047857', label: 'Entregado', icon: CheckCircle },
  QUEUED:    { bg: '#fffbeb', fg: '#b45309', label: 'En cola',   icon: Clock },
  FAILED:    { bg: '#fef2f2', fg: '#b91c1c', label: 'Fallido',   icon: AlertCircle },
  BOUNCED:   { bg: '#fef2f2', fg: '#b91c1c', label: 'Rebotado',  icon: AlertCircle },
}

const CHANNEL_ICON: Record<NotificationChannel, typeof Mail> = {
  email:    Mail,
  whatsapp: MessageCircle,
  sms:      MessageCircle,
  push:     AlertCircle,
}

// ─── Doctor (referral) notification config ────────────────────────────────────

const DOCTOR_NOTIF_CONFIG: Record<DoctorNotifType, { bg: string; fg: string; label: string }> = {
  REFERRAL_CREATED:   { bg: '#eff6ff', fg: '#1d4ed8', label: 'Nueva referencia' },
  REFERRAL_ACCEPTED:  { bg: '#f0fdf4', fg: '#15803d', label: 'Referencia aceptada' },
  REFERRAL_REJECTED:  { bg: '#fef2f2', fg: '#b91c1c', label: 'Referencia rechazada' },
  REFERRAL_COMPLETED: { bg: '#f0fdf4', fg: '#047857', label: 'Referencia completada' },
  REFERRAL_CANCELLED: { bg: '#f8fafc', fg: '#64748b', label: 'Referencia cancelada' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.floor(hrs / 24)} d`
}

function parseFailedReason(reason: string | null): string {
  if (!reason) return ''
  const jsonMatch = reason.match(/"message"\s*:\s*"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]
  const colonMatch = reason.match(/error\s+\d+:\s*(.+)/i)
  if (colonMatch) {
    const after = colonMatch[1].trim()
    if (after.startsWith('{')) return 'Error de autenticación — verifica las credenciales en .env'
    return after.length > 80 ? after.substring(0, 77) + '…' : after
  }
  return reason.length > 80 ? reason.substring(0, 77) + '…' : reason
}

// ─── Patient notification item ────────────────────────────────────────────────

function PatientNotifItem({ n, onDismiss }: { n: NotificationEntry; onDismiss: (id: string) => void }) {
  const s = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.QUEUED
  const StatusIcon = s.icon
  const ChannelIcon = CHANNEL_ICON[n.channel] ?? Mail
  const isCritical = n.status === 'FAILED' || n.status === 'BOUNCED'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 16px',
      borderBottom: '1px solid var(--mt-border)',
      background: isCritical ? '#fff8f8' : 'var(--mt-surface)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ChannelIcon size={14} color={s.fg} />
      </div>

      <a href={`/patients/${n.patient_id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {n.patient_name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--mt-muted)', flexShrink: 0 }}>
            {relativeTime(n.created_at)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>{TYPE_LABELS[n.type] ?? n.type}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
            background: s.bg, color: s.fg,
          }}>
            <StatusIcon size={10} />
            {s.label}
          </span>
        </div>
        {n.failed_reason && (
          <div style={{
            marginTop: 4, fontSize: 11, color: '#b91c1c',
            background: '#fef2f2', borderRadius: 4, padding: '2px 6px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {parseFailedReason(n.failed_reason)}
          </div>
        )}
      </a>

      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onDismiss(n.id) }}
        title="Descartar"
        style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 4, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--mt-muted)',
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ─── Doctor (referral) notification item ──────────────────────────────────────

function DoctorNotifItem({
  n,
  onRead,
}: {
  n: DoctorNotification
  onRead: (id: string) => void
}) {
  const cfg = DOCTOR_NOTIF_CONFIG[n.type]
  const patientName = n.patient
    ? `${n.patient.first_name} ${n.patient.last_name}`
    : ''

  return (
    <Link
      href={`/referrals`}
      onClick={() => { if (!n.is_read) onRead(n.id) }}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid var(--mt-border)',
        background: n.is_read ? 'var(--mt-surface)' : cfg.bg,
        transition: 'background .2s',
      }}>
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: cfg.bg,
          border: `1.5px solid ${cfg.fg}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowUpDown size={14} color={cfg.fg} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: n.is_read ? 400 : 600,
              color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {n.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--mt-muted)', flexShrink: 0 }}>
              {relativeTime(n.created_at)}
            </span>
          </div>

          {patientName && (
            <div style={{ fontSize: 12, color: cfg.fg, fontWeight: 500, marginTop: 1 }}>
              {patientName}
            </div>
          )}

          <div style={{
            fontSize: 12, color: 'var(--mt-text-2)', marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {n.body}
          </div>

          <div style={{
            marginTop: 4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
            background: cfg.bg, color: cfg.fg,
          }}>
            {cfg.label}
          </div>
        </div>

        {/* Unread dot */}
        {!n.is_read && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: cfg.fg,
            flexShrink: 0, marginTop: 4,
          }} />
        )}
      </div>
    </Link>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function NotificationPanel({
  notifications,
  doctorNotifications,
  failedCount,
  unreadReferralCount,
  loading,
  onRefresh,
  onDismiss,
  onDoctorNotifRead,
  onMarkAllRead,
}: {
  notifications: NotificationEntry[]
  doctorNotifications: DoctorNotification[]
  failedCount: number
  unreadReferralCount: number
  loading: boolean
  onRefresh: () => void
  onDismiss: (id: string) => void
  onDoctorNotifRead: (id: string) => void
  onMarkAllRead: () => void
}) {
  const hasAny = notifications.length > 0 || doctorNotifications.length > 0

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
      width: 380, maxWidth: 'calc(100vw - 24px)',
      background: 'var(--mt-surface)',
      border: '1px solid var(--mt-border)',
      borderRadius: 14,
      boxShadow: 'var(--mt-shadow-lg)',
      overflow: 'hidden',
      animation: 'mt-fade-scale-in .18s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--mt-border)',
        background: 'var(--mt-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>Notificaciones</span>
          {failedCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c' }}>
              {failedCount} fallidas
            </span>
          )}
          {unreadReferralCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8' }}>
              {unreadReferralCount} nuevas
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {unreadReferralCount > 0 && (
            <button
              onClick={onMarkAllRead}
              title="Marcar todas como leídas"
              style={{
                width: 28, height: 28, borderRadius: 6, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--mt-muted)',
              }}
            >
              <CheckCheck size={14} />
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--mt-muted)',
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }} className="mt-scroll">
        {!hasAny ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>
            {loading ? 'Cargando notificaciones…' : 'Sin notificaciones recientes'}
          </div>
        ) : (
          <>
            {/* Referral notifications (doctor-to-doctor) — most important, shown first */}
            {doctorNotifications.length > 0 && (
              <>
                <div style={{
                  padding: '6px 16px 4px', fontSize: 10, fontWeight: 700,
                  color: 'var(--mt-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'var(--mt-bg)', borderBottom: '1px solid var(--mt-border)',
                }}>
                  Referencias médicas
                </div>
                {doctorNotifications.map(n => (
                  <DoctorNotifItem key={n.id} n={n} onRead={onDoctorNotifRead} />
                ))}
              </>
            )}

            {/* Patient notifications */}
            {notifications.length > 0 && (
              <>
                <div style={{
                  padding: '6px 16px 4px', fontSize: 10, fontWeight: 700,
                  color: 'var(--mt-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'var(--mt-bg)', borderBottom: '1px solid var(--mt-border)',
                }}>
                  Pacientes
                </div>
                {notifications.map(n => <PatientNotifItem key={n.id} n={n} onDismiss={onDismiss} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {hasAny && (
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--mt-border)',
          background: 'var(--mt-bg)', textAlign: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
            {doctorNotifications.length + notifications.length} notificaciones · actualiza cada 60 s
          </span>
        </div>
      )}
    </div>
  )
}
