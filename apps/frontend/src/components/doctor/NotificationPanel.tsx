'use client'

import { useState } from 'react'
import {
  RefreshCw, ArrowUpDown, CheckCheck, FileText, FlaskConical,
  Activity, ChevronDown, ExternalLink, CalendarDays, X, AlertTriangle,
  CheckCircle2, Clock,
} from 'lucide-react'
import Link from 'next/link'
import type {
  DoctorNotification, DoctorNotifType,
  DocumentUploadedMeta, LabResultReadyMeta,
  CheckInAlertMeta, AppointmentMeta, ExternalLabMeta,
} from '@/lib/doctor/referral-notifications-api'

// ─── Notification tier classification ─────────────────────────────────────────
// Based on JAMIA 2024 + Vanderbilt research:
// CRITICAL → immediate action needed (red)
// ACTIONABLE → doctor decision point (amber)
// INFORMATIONAL → awareness only (blue/green)

type Tier = 'CRITICAL' | 'ACTIONABLE' | 'INFORMATIONAL'

function getTier(type: DoctorNotifType, meta?: DoctorNotifMeta | null): Tier {
  if (type === 'PATIENT_CHECKIN_ALERT') return 'CRITICAL'
  if (type === 'APPOINTMENT_CANCELLED') return 'ACTIONABLE'
  if (type === 'LAB_RESULT_READY') {
    const m = meta as LabResultReadyMeta | undefined
    if (m && (m.critical_count ?? 0) > 0) return 'CRITICAL'
    if (m && m.abnormal_count > 0) return 'ACTIONABLE'
    return 'INFORMATIONAL'
  }
  return 'INFORMATIONAL'
}

type DoctorNotifMeta = DocumentUploadedMeta | LabResultReadyMeta | CheckInAlertMeta | AppointmentMeta | ExternalLabMeta | Record<string, unknown>

// ─── Config per notification type ─────────────────────────────────────────────

type NotifConfig = {
  bg: string; fg: string; label: string
  icon: React.ElementType; tierBg?: string
}

const NOTIF_CONFIG: Record<DoctorNotifType, NotifConfig> = {
  REFERRAL_CREATED:      { bg: '#eff6ff', fg: '#1d4ed8', label: 'Nueva referencia',          icon: ArrowUpDown },
  REFERRAL_ACCEPTED:     { bg: '#f0fdf4', fg: '#15803d', label: 'Referencia aceptada',        icon: CheckCircle2 },
  REFERRAL_REJECTED:     { bg: '#fef2f2', fg: '#b91c1c', label: 'Referencia rechazada',       icon: X },
  REFERRAL_COMPLETED:    { bg: '#f0fdf4', fg: '#047857', label: 'Referencia completada',      icon: CheckCircle2 },
  REFERRAL_CANCELLED:    { bg: '#f8fafc', fg: '#64748b', label: 'Referencia cancelada',       icon: X },
  DOCUMENT_UPLOADED:     { bg: '#f5f3ff', fg: '#7c3aed', label: 'Documento compartido',       icon: FileText },
  LAB_RESULT_READY:      { bg: '#ecfdf5', fg: '#047857', label: 'Resultados de lab',          icon: FlaskConical },
  PATIENT_CHECKIN_ALERT: { bg: '#fff1f2', fg: '#be123c', label: 'Revisión necesaria',         icon: AlertTriangle, tierBg: '#fff1f2' },
  APPOINTMENT_CONFIRMED: { bg: '#ecfdf5', fg: '#047857', label: 'Cita confirmada',            icon: CheckCircle2 },
  APPOINTMENT_CANCELLED: { bg: '#fff7ed', fg: '#c2410c', label: 'Cita cancelada',             icon: CalendarDays, tierBg: '#fff7ed' },
  EXTERNAL_LAB_SUBMITTED:{ bg: '#f0f9ff', fg: '#0369a1', label: 'Lab externo recibido',       icon: FlaskConical },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

function isCheckInMeta(m: unknown): m is CheckInAlertMeta {
  return typeof m === 'object' && m !== null && 'check_in_id' in m
}
function isDocumentMeta(m: unknown): m is DocumentUploadedMeta {
  return typeof m === 'object' && m !== null && 'document_id' in m
}
function isLabMeta(m: unknown): m is LabResultReadyMeta {
  return typeof m === 'object' && m !== null && 'lab_order_id' in m
}
function isAppointmentMeta(m: unknown): m is AppointmentMeta {
  return typeof m === 'object' && m !== null && 'appointment_id' in m
}
function isExternalLabMeta(m: unknown): m is ExternalLabMeta {
  return typeof m === 'object' && m !== null && 'submission_id' in m
}

const APPT_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta', FOLLOW_UP: 'Seguimiento', PROCEDURE: 'Procedimiento',
  CHECK_UP: 'Control', EMERGENCY: 'Urgencia', TELECONSULT: 'Teleconsulta',
}

const DOC_TYPE_LABELS: Record<string, string> = {
  PRESCRIPTION: 'Receta', LAB_RESULT: 'Resultado de lab', IMAGING: 'Imagen',
  CONSENT: 'Consentimiento', CLINICAL_NOTE: 'Nota clínica', OTHER: 'Documento',
}

// ─── Expandable detail components ─────────────────────────────────────────────

function CheckInDetail({ meta, patientId }: { meta: CheckInAlertMeta; patientId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {meta.red_flags.map(f => (
          <span key={f} style={{
            fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
            background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
          }}>{f}</span>
        ))}
        {typeof meta.pain_score === 'number' && meta.pain_score >= 8 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
            Dolor {meta.pain_score}/10
          </span>
        )}
        {typeof meta.temperature_c === 'number' && meta.temperature_c >= 38 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
            Fiebre {meta.temperature_c}°C
          </span>
        )}
        {meta.adherence_self_report === 'none' && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            Sin medicamentos
          </span>
        )}
      </div>
      {patientId && (
        <Link href={`/patients/${patientId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#be123c', textDecoration: 'none', marginTop: 2 }}>
          Ver ficha del paciente <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}

function LabDetail({ meta, patientId }: { meta: LabResultReadyMeta; patientId?: string }) {
  const critical = meta.critical_count ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <FlaskConical size={14} color="var(--mt-muted)" />
        <span style={{ fontSize: 12.5, color: 'var(--mt-text)' }}>
          <strong>{meta.result_count}</strong> parámetro{meta.result_count !== 1 ? 's' : ''}
        </span>
        {critical > 0 && (
          <span style={{ fontSize: 11, fontWeight: 800, color: '#be123c', background: '#fff1f2', borderRadius: 999, padding: '2px 8px', border: '1px solid #fecdd3' }}>
            {critical} CRÍTICO{critical > 1 ? 'S' : ''}
          </span>
        )}
        {meta.abnormal_count > 0 && critical === 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', background: '#fff7ed', borderRadius: 999, padding: '2px 8px' }}>
            {meta.abnormal_count} fuera de rango
          </span>
        )}
        {meta.abnormal_count === 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#047857', background: '#ecfdf5', borderRadius: 999, padding: '2px 7px' }}>
            Todos normales
          </span>
        )}
      </div>
      {patientId && (
        <Link href={`/patients/${patientId}?tab=lab`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#047857', textDecoration: 'none', marginTop: 2 }}>
          Ver resultados completos <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}

function DocumentDetail({ meta, patientId }: { meta: DocumentUploadedMeta; patientId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={14} color="var(--mt-muted)" />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.file_name}
        </span>
        <span style={{ flexShrink: 0, fontSize: 11, color: '#7c3aed', background: '#f5f3ff', borderRadius: 999, padding: '1px 6px', fontWeight: 600 }}>
          {DOC_TYPE_LABELS[meta.document_type] ?? 'Documento'}
        </span>
      </div>
      {meta.note && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-text-2)', fontStyle: 'italic', lineHeight: 1.4 }}>
          &ldquo;{meta.note}&rdquo;
        </p>
      )}
      {patientId && (
        <Link href={`/patients/${patientId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#7c3aed', textDecoration: 'none', marginTop: 2 }}>
          Ver expediente <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}

function AppointmentDetail({ meta, patientId }: { meta: AppointmentMeta; patientId?: string }) {
  const d = new Date(meta.scheduled_at)
  const dateStr = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12.5, color: 'var(--mt-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={13} color="var(--mt-muted)" />
        <span style={{ textTransform: 'capitalize' }}>{dateStr}</span>
        <span style={{ color: 'var(--mt-muted)' }}>·</span>
        <strong>{timeStr}</strong>
        {meta.appointment_type && (
          <span style={{ fontSize: 11, color: 'var(--mt-text-2)', background: 'var(--mt-elevated)', borderRadius: 999, padding: '1px 6px' }}>
            {APPT_TYPE_LABELS[meta.appointment_type] ?? meta.appointment_type}
          </span>
        )}
      </div>
      {meta.cancelled_reason && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-text-2)', fontStyle: 'italic', lineHeight: 1.4 }}>
          Motivo: &ldquo;{meta.cancelled_reason}&rdquo;
        </p>
      )}
      {patientId && (
        <Link href={`/patients/${patientId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--mt-primary)', textDecoration: 'none', marginTop: 2 }}>
          Ver paciente <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}

function ExternalLabDetail({ meta, patientId }: { meta: ExternalLabMeta; patientId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12.5, color: 'var(--mt-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <FlaskConical size={13} color="var(--mt-muted)" />
        <strong>{meta.file_count} archivo{meta.file_count > 1 ? 's' : ''}</strong>
        <span style={{ color: 'var(--mt-muted)', fontSize: 12 }}>
          {meta.file_names.slice(0, 2).join(', ')}{meta.file_names.length > 2 ? '…' : ''}
        </span>
      </div>
      {meta.patient_notes && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-text-2)', fontStyle: 'italic', lineHeight: 1.4 }}>
          &ldquo;{meta.patient_notes}&rdquo;
        </p>
      )}
      {patientId && (
        <Link href={`/patients/${patientId}?tab=lab`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#0369a1', textDecoration: 'none', marginTop: 2 }}>
          Revisar y validar <ExternalLink size={11} />
        </Link>
      )}
    </div>
  )
}

// ─── Single notification item ──────────────────────────────────────────────────

function NotifItem({ n, onRead }: { n: DoctorNotification; onRead: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = NOTIF_CONFIG[n.type] ?? NOTIF_CONFIG.REFERRAL_CREATED
  const CfgIcon = cfg.icon
  const tier = getTier(n.type, n.metadata as DoctorNotifMeta | null)
  const patientName = n.patient ? `${n.patient.first_name} ${n.patient.last_name}` : ''
  const hasExpand = n.metadata != null
  const isReferral = n.type.startsWith('REFERRAL_')
  const href = isReferral ? '/referrals' : n.patient ? `/patients/${n.patient.id}` : '#'

  // Tier visual markers
  const tierLeft = tier === 'CRITICAL' ? '#be123c' : tier === 'ACTIONABLE' ? '#c2410c' : 'transparent'
  const rowBg = n.is_read
    ? 'var(--mt-surface)'
    : tier === 'CRITICAL'
      ? '#fff1f2'
      : tier === 'ACTIONABLE'
        ? '#fff7ed'
        : cfg.bg

  function handleClick() {
    if (!n.is_read) onRead(n.id)
    if (hasExpand) setExpanded(v => !v)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--mt-border)' }}>
      <div
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 16px',
          background: rowBg,
          borderLeft: `3px solid ${tierLeft}`,
          cursor: hasExpand ? 'pointer' : 'default',
          transition: 'background .15s',
        }}
      >
        {/* Type icon */}
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: cfg.bg, border: `1.5px solid ${cfg.fg}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CfgIcon size={14} color={cfg.fg} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 12.5, fontWeight: n.is_read ? 400 : 700,
              color: tier === 'CRITICAL' ? '#be123c' : 'var(--mt-text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {n.title}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--mt-muted)', flexShrink: 0 }}>
              {relativeTime(n.created_at)}
            </span>
          </div>

          {patientName && (
            <div style={{ fontSize: 11.5, color: cfg.fg, fontWeight: 600, marginTop: 1 }}>
              {patientName}{n.patient?.mrn ? ` · ${n.patient.mrn}` : ''}
            </div>
          )}

          <div style={{
            fontSize: 12, color: 'var(--mt-text-2)', marginTop: 2, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
          }}>
            {n.body}
          </div>

          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
              background: cfg.bg, color: cfg.fg,
            }}>
              {cfg.label}
            </span>

            {!isReferral && n.patient && !hasExpand && (
              <Link href={href}
                onClick={e => { e.stopPropagation(); if (!n.is_read) onRead(n.id) }}
                style={{ fontSize: 11, color: 'var(--mt-primary)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                Ver <ExternalLink size={9} />
              </Link>
            )}

            {hasExpand && (
              <span style={{ fontSize: 11, color: 'var(--mt-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                {expanded ? 'Ocultar' : 'Ver detalle'}
              </span>
            )}
          </div>
        </div>

        {/* Unread dot */}
        {!n.is_read && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.fg, flexShrink: 0, marginTop: 5 }} />
        )}
      </div>

      {/* Expandable detail */}
      {expanded && n.metadata && (
        <div style={{
          padding: '10px 16px 12px 55px',
          background: (cfg.tierBg ?? cfg.bg) + '88',
          borderTop: `1px solid ${cfg.fg}18`,
          animation: 'mt-fade-in .15s ease-out',
        }}>
          {isCheckInMeta(n.metadata)    && <CheckInDetail    meta={n.metadata} patientId={n.patient?.id} />}
          {isDocumentMeta(n.metadata)   && <DocumentDetail   meta={n.metadata} patientId={n.patient?.id} />}
          {isLabMeta(n.metadata)        && <LabDetail        meta={n.metadata} patientId={n.patient?.id} />}
          {isAppointmentMeta(n.metadata) && <AppointmentDetail meta={n.metadata} patientId={n.patient?.id} />}
          {isExternalLabMeta(n.metadata) && <ExternalLabDetail meta={n.metadata} patientId={n.patient?.id} />}
        </div>
      )}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function NotificationPanel({
  doctorNotifications,
  unreadReferralCount,
  loading,
  onRefresh,
  onDoctorNotifRead,
  onMarkAllRead,
}: {
  doctorNotifications: DoctorNotification[]
  unreadReferralCount: number
  loading: boolean
  onRefresh: () => void
  onDoctorNotifRead: (id: string) => void
  onMarkAllRead: () => void
}) {
  // Tier grouping (research: critical alerts first, then actionable, then informational)
  const critical      = doctorNotifications.filter(n => getTier(n.type, n.metadata as DoctorNotifMeta | null) === 'CRITICAL')
  const actionable    = doctorNotifications.filter(n => getTier(n.type, n.metadata as DoctorNotifMeta | null) === 'ACTIONABLE')
  const informational = doctorNotifications.filter(n => getTier(n.type, n.metadata as DoctorNotifMeta | null) === 'INFORMATIONAL')
  const hasAny        = doctorNotifications.length > 0

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
      width: 400, maxWidth: 'calc(100vw - 24px)',
      background: 'var(--mt-surface)',
      border: '1px solid var(--mt-border)',
      borderRadius: 14,
      boxShadow: 'var(--mt-shadow-lg)',
      overflow: 'hidden',
      animation: 'mt-fade-scale-in .18s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--mt-border)', background: 'var(--mt-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mt-text)' }}>Actividad clínica</span>
          {critical.filter(n => !n.is_read).length > 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
              {critical.filter(n => !n.is_read).length} alerta{critical.filter(n => !n.is_read).length > 1 ? 's' : ''}
            </span>
          )}
          {unreadReferralCount > 0 && critical.filter(n => !n.is_read).length === 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8' }}>
              {unreadReferralCount} sin leer
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {unreadReferralCount > 0 && (
            <button onClick={onMarkAllRead} title="Marcar todas como leídas"
              style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt-muted)' }}>
              <CheckCheck size={14} />
            </button>
          )}
          <button onClick={onRefresh} disabled={loading}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt-muted)' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* List — critical first, then actionable, then informational */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }} className="mt-scroll">
        {!hasAny ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>
            {loading ? 'Cargando actividad…' : 'Sin actividad reciente'}
          </div>
        ) : (
          <>
            {critical.length > 0 && (
              <>
                <SectionHeader label="Requiere revisión" color="#be123c" bg="#fff1f2" />
                {critical.map(n => <NotifItem key={n.id} n={n} onRead={onDoctorNotifRead} />)}
              </>
            )}
            {actionable.length > 0 && (
              <>
                <SectionHeader label="Acción recomendada" color="#c2410c" bg="#fff7ed" />
                {actionable.map(n => <NotifItem key={n.id} n={n} onRead={onDoctorNotifRead} />)}
              </>
            )}
            {informational.length > 0 && (
              <>
                <SectionHeader label="Actividad reciente" color="var(--mt-muted)" bg="var(--mt-bg)" />
                {informational.map(n => <NotifItem key={n.id} n={n} onRead={onDoctorNotifRead} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {hasAny && (
        <div style={{ padding: '7px 16px', borderTop: '1px solid var(--mt-border)', background: 'var(--mt-bg)', textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
            {doctorNotifications.length} evento{doctorNotifications.length !== 1 ? 's' : ''} · actualiza cada 60 s
          </span>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <div style={{
      padding: '5px 16px 4px', fontSize: 10, fontWeight: 700,
      color, letterSpacing: '0.08em', textTransform: 'uppercase',
      background: bg, borderBottom: '1px solid var(--mt-border)',
    }}>
      {label}
    </div>
  )
}
