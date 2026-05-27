'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  Mail,
  MessageCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  fetchClinicNotifications,
  type NotificationChannel,
  type NotificationEntry,
  type NotificationStatus,
  type NotificationType,
} from '@/lib/doctor/notifications-api'

// ─── Label maps ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<NotificationType, string> = {
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
  DELIVERED: { bg: '#dcfce7', fg: '#15803d', label: 'Entregado', icon: CheckCircle },
  QUEUED:    { bg: '#fffbeb', fg: '#b45309', label: 'En cola',   icon: Clock },
  FAILED:    { bg: '#fef2f2', fg: '#b91c1c', label: 'Fallido',   icon: AlertCircle },
  BOUNCED:   { bg: '#fef2f2', fg: '#991b1b', label: 'Rebotado',  icon: AlertCircle },
}

const CHANNEL_ICON: Record<NotificationChannel, typeof Mail> = {
  email:    Mail,
  whatsapp: MessageCircle,
  sms:      MessageCircle,
  push:     Bell,
}

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email:    'Email',
  whatsapp: 'WhatsApp',
  sms:      'SMS',
  push:     'Push',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

function parseFailedReason(reason: string | null): string {
  if (!reason) return ''
  const jsonMatch = reason.match(/"message"\s*:\s*"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]
  const colonMatch = reason.match(/error\s+\d+:\s*(.+)/i)
  if (colonMatch) {
    const after = colonMatch[1].trim()
    if (after.startsWith('{')) return 'Error de autenticación — verifica las credenciales en .env'
    return after.length > 100 ? after.slice(0, 97) + '…' : after
  }
  return reason.length > 100 ? reason.slice(0, 97) + '…' : reason
}

function maskRecipient(r: string): string {
  if (r.includes('@')) {
    const [local, domain] = r.split('@')
    return `${local.slice(0, 2)}***@${domain}`
  }
  if (r.startsWith('+') || /^\d/.test(r)) {
    return r.slice(0, 4) + '···' + r.slice(-2)
  }
  return r
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type Tab = 'all' | 'failed' | 'dose' | 'portal'

function applyTab(entries: NotificationEntry[], tab: Tab): NotificationEntry[] {
  if (tab === 'all') return entries
  if (tab === 'failed') return entries.filter(e => e.status === 'FAILED' || e.status === 'BOUNCED')
  if (tab === 'dose') return entries.filter(e => e.type === 'DOSE_REMINDER' || e.type === 'DOSE_MISSED')
  if (tab === 'portal') return entries.filter(e => e.type === 'WELCOME' || e.type === 'MAGIC_LINK')
  return entries
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--mt-surface)',
      border: '1px solid var(--mt-border)',
      borderRadius: 14,
      padding: '18px 22px',
      flex: 1, minWidth: 120,
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </p>
      <p style={{ margin: '8px 0 2px', fontSize: 30, fontWeight: 800, color: color ?? 'var(--mt-text)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-muted)' }}>{sub}</p>}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function NotifRow({ n }: { n: NotificationEntry }) {
  const s = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.QUEUED
  const StatusIcon = s.icon
  const ChannelIcon = CHANNEL_ICON[n.channel] ?? Mail
  const isCritical = n.status === 'FAILED' || n.status === 'BOUNCED'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr auto',
      gap: 12,
      alignItems: 'flex-start',
      padding: '14px 18px',
      borderBottom: '1px solid var(--mt-border)',
      background: isCritical ? '#fff8f8' : 'var(--mt-surface)',
      transition: 'background .15s',
    }}>
      {/* Channel icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ChannelIcon size={14} color={s.fg} />
      </div>

      {/* Main content */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href={`/patients/${n.patient_id}`}
            style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)', textDecoration: 'none' }}
          >
            {n.patient_name}
          </Link>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
            background: s.bg, color: s.fg,
          }}>
            <StatusIcon size={10} />
            {s.label}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
            background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
          }}>
            {CHANNEL_LABELS[n.channel]}
          </span>
        </div>

        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)' }}>
          {TYPE_LABELS[n.type] ?? n.type}
          {n.attempt_count > 1 && (
            <span style={{ color: 'var(--mt-muted)', marginLeft: 6 }}>
              · {n.attempt_count} intentos
            </span>
          )}
        </p>

        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--mt-muted)' }}>
          {maskRecipient(n.recipient)}
        </p>

        {n.failed_reason && (
          <p style={{
            margin: '6px 0 0', fontSize: 11.5, color: '#b91c1c',
            background: '#fef2f2', borderRadius: 6, padding: '4px 8px',
            lineHeight: 1.4,
          }}>
            {parseFailedReason(n.failed_reason)}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span style={{ fontSize: 11.5, color: 'var(--mt-muted)', whiteSpace: 'nowrap', marginTop: 2 }}>
        {relativeTime(n.created_at)}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { token } = useAuth()
  const [entries, setEntries] = useState<NotificationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetchClinicNotifications(token, 100)
      setEntries(res.data)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const visible = applyTab(entries, tab)

  const total   = entries.length
  const failed  = entries.filter(e => e.status === 'FAILED' || e.status === 'BOUNCED').length
  const sent    = entries.filter(e => e.status === 'SENT' || e.status === 'DELIVERED').length
  const rate    = total > 0 ? Math.round((sent / total) * 100) : 0

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all',    label: 'Todas',          count: total },
    { id: 'failed', label: 'Fallidas',       count: failed },
    { id: 'dose',   label: 'Dosis',          count: entries.filter(e => e.type === 'DOSE_REMINDER' || e.type === 'DOSE_MISSED').length },
    { id: 'portal', label: 'Portal',         count: entries.filter(e => e.type === 'WELCOME' || e.type === 'MAGIC_LINK').length },
  ]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)' }}>
            Notificaciones
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
            Actividad de mensajes enviados a pacientes · últimas 100 entradas
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
            fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total enviadas"  value={total} sub="últimas 100 entradas" />
        <StatCard label="Fallidas"        value={failed} sub={failed > 0 ? 'requieren atención' : 'sin errores'} color={failed > 0 ? '#b91c1c' : undefined} />
        <StatCard label="Tasa de entrega" value={`${rate}%`} sub={`${sent} entregadas / ${total}`} color={rate >= 90 ? '#15803d' : rate >= 70 ? '#b45309' : '#b91c1c'} />
      </div>

      {/* Failed banner */}
      {failed > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 12,
          background: '#fff1f2', border: '1px solid #fecdd3',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <TriangleAlert size={16} color="#b91c1c" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13.5, color: '#b91c1c', fontWeight: 500 }}>
            {failed} notificación{failed !== 1 ? 'es' : ''} fallida{failed !== 1 ? 's' : ''} — revisa las credenciales de WhatsApp / email en la configuración del servidor.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${tab === t.id ? 'var(--mt-primary)' : 'var(--mt-border)'}`,
              background: tab === t.id ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
              color: tab === t.id ? 'var(--mt-primary-deep)' : 'var(--mt-text-2)',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
              transition: 'all .15s',
            }}
          >
            {t.label}
            <span style={{
              fontSize: 11, fontWeight: 600,
              padding: '1px 6px', borderRadius: 999,
              background: tab === t.id ? 'rgba(37,99,235,.12)' : 'var(--mt-elevated)',
              color: tab === t.id ? 'var(--mt-primary)' : 'var(--mt-muted)',
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{
        background: 'var(--mt-surface)',
        border: '1px solid var(--mt-border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', margin: '0 auto 12px',
              border: '3px solid var(--mt-primary-mist)',
              borderTopColor: 'var(--mt-primary)',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mt-muted)' }}>Cargando notificaciones…</p>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
              background: 'var(--mt-primary-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={22} color="var(--mt-primary)" />
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--mt-text)' }}>
              {tab === 'all' ? 'Sin notificaciones registradas' : 'Sin resultados en este filtro'}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mt-muted)' }}>
              {tab === 'all'
                ? 'Cuando el sistema envíe mensajes a pacientes, aparecerán aquí.'
                : 'Prueba con otro filtro o espera nuevas notificaciones.'}
            </p>
          </div>
        ) : (
          <>
            <div style={{
              padding: '10px 18px', borderBottom: '1px solid var(--mt-border)',
              background: 'var(--mt-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {visible.length} resultado{visible.length !== 1 ? 's' : ''}
              </span>
              {lastUpdated && (
                <span style={{ fontSize: 11.5, color: 'var(--mt-muted)' }}>
                  Actualizado {relativeTime(lastUpdated.toISOString())}
                </span>
              )}
            </div>
            {visible.map(n => <NotifRow key={n.id} n={n} />)}
          </>
        )}
      </div>
    </div>
  )
}
