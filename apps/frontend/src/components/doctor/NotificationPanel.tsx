'use client'

import { AlertCircle, CheckCircle, Clock, Mail, MessageCircle, RefreshCw } from 'lucide-react'
import type { NotificationEntry, NotificationStatus, NotificationChannel } from '@/lib/doctor/notifications-api'

// ─── Label maps ───────────────────────────────────────────────────────────────

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

// ─── Item ─────────────────────────────────────────────────────────────────────

function NotifItem({ n }: { n: NotificationEntry }) {
  const s = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.QUEUED
  const StatusIcon = s.icon
  const ChannelIcon = CHANNEL_ICON[n.channel] ?? Mail
  const isCritical = n.status === 'FAILED' || n.status === 'BOUNCED'

  return (
    <a
      href={`/patients/${n.patient_id}`}
      style={{
        display: 'block', padding: '12px 16px', textDecoration: 'none',
        borderBottom: '1px solid var(--mt-border)',
        background: isCritical ? '#fff8f8' : 'var(--mt-surface)',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--mt-elevated)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isCritical ? '#fff8f8' : 'var(--mt-surface)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Channel icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChannelIcon size={14} color={s.fg} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.patient_name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--mt-muted)', flexShrink: 0 }}>
              {relativeTime(n.created_at)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>
              {TYPE_LABELS[n.type] ?? n.type}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
              background: s.bg, color: s.fg,
            }}>
              <StatusIcon size={10} />
              {s.label}
            </span>
          </div>

          {/* Failed reason */}
          {n.failed_reason && (
            <div style={{
              marginTop: 4, fontSize: 11, color: '#b91c1c',
              background: '#fef2f2', borderRadius: 4, padding: '2px 6px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {n.failed_reason}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function NotificationPanel({
  notifications,
  failedCount,
  loading,
  onRefresh,
}: {
  notifications: NotificationEntry[]
  failedCount: number
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
      width: 360, maxWidth: 'calc(100vw - 24px)',
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
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>Alertas recientes</span>
          {failedCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999,
              background: '#fef2f2', color: '#b91c1c',
            }}>
              {failedCount} fallidas
            </span>
          )}
        </div>
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

      {/* List */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }} className="mt-scroll">
        {notifications.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            fontSize: 13, color: 'var(--mt-muted)',
          }}>
            {loading ? 'Cargando alertas…' : 'Sin notificaciones recientes'}
          </div>
        ) : (
          notifications.map(n => <NotifItem key={n.id} n={n} />)
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--mt-border)',
          background: 'var(--mt-bg)', textAlign: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
            {notifications.length} notificaciones · actualiza cada 60 s
          </span>
        </div>
      )}
    </div>
  )
}
