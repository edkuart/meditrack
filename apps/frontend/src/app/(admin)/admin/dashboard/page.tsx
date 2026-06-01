'use client'

import { useEffect, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, Users, Building2, Clock, CheckCircle2,
  XCircle, X, LogOut, Loader2, AlertTriangle,
  KeyRound, FileClock, Gift, Sparkles,
} from 'lucide-react'
import {
  clearAdminSession,
  fetchMetrics, fetchUsers, verifyDoctor, rejectDoctor, updateAdminUserStatus, fetchTenants, updateTenant,
  fetchPasswordTickets, updatePasswordTicket, issuePasswordResetLink,
  fetchAdminAuditLogs, fetchCommercialAccounts, grantTenantAccess, revokeTenantAccessGrant, expireCommercialAccessGrants,
  markAdminInvoicePaid, cancelAdminInvoice,
  type PendingDoctor, type Tenant, type AdminMetrics, type PasswordTicket, type PasswordTicketStatus,
  type AdminAuditLog, type CommercialAccount, type AccessGrantDuration, type PlanType, type CommercialSummary,
} from '@/lib/admin/admin-api'

type Tab = 'pending' | 'tickets' | 'tenants' | 'commercial' | 'audit'

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ElementType; accent: string
}) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 12, padding: '20px 22px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: accent + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} color={accent} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function DoctorRow({ doctor, onVerify, onReject, onStatusChange }: {
  doctor: PendingDoctor
  onVerify: (id: string) => void
  onReject: (id: string) => void
  onStatusChange: (id: string, isActive: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const isRejected = !!doctor.verification_rejected_at

  async function handleVerify() {
    setBusy(true)
    try { await verifyDoctor(doctor.id); onVerify(doctor.id) } finally { setBusy(false) }
  }

  async function handleReject() {
    const reason = window.prompt('Razón del rechazo (mínimo 10 caracteres):')
    if (!reason || reason.length < 10) return
    setBusy(true)
    try { await rejectDoctor(doctor.id, reason); onReject(doctor.id) } finally { setBusy(false) }
  }

  async function handleToggleActive() {
    const nextActive = !doctor.is_active
    const reason = nextActive
      ? window.prompt('Nota interna de reactivación (opcional):') ?? undefined
      : window.prompt('Razón para desactivar este usuario (mínimo 10 caracteres):')
    if (!nextActive && (!reason || reason.trim().length < 10)) return
    setBusy(true)
    try {
      await updateAdminUserStatus(doctor.id, nextActive, reason?.trim() || undefined)
      onStatusChange(doctor.id, nextActive)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            Dr. {doctor.first_name} {doctor.last_name}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{doctor.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isRejected
            ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(239,68,68,.15)', color: '#f87171', fontWeight: 500, flexShrink: 0 }}>Rechazado</span>
            : doctor.is_verified
              ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(52,211,153,.12)', color: '#34d399', fontWeight: 500, flexShrink: 0 }}>Verificado</span>
              : <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(251,191,36,.12)', color: '#fbbf24', fontWeight: 500, flexShrink: 0 }}>Pendiente</span>
          }
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: doctor.is_active ? 'rgba(96,165,250,.12)' : 'rgba(239,68,68,.12)',
            color: doctor.is_active ? '#60a5fa' : '#f87171',
            fontWeight: 500, flexShrink: 0,
          }}>
            {doctor.is_active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { l: 'Colegiado', v: doctor.colegiado_number },
          { l: 'Especialidad', v: doctor.specialty },
          { l: 'Cédula', v: doctor.professional_id },
          { l: 'Clínica', v: doctor.tenant?.name },
          { l: 'Rol', v: doctor.role },
        ].map(item => item.v && (
          <div key={item.l}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{item.l}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1 }}>{item.v}</div>
          </div>
        ))}
      </div>

      {doctor.dpi_document_key && (
        <div style={{ fontSize: 12, color: '#60a5fa' }}>
          DPI adjunto: <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{doctor.dpi_document_key.slice(0, 32)}…</span>
        </div>
      )}

      {isRejected && doctor.verification_rejected_reason && (
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f87171',
        }}>
          Razón: {doctor.verification_rejected_reason}
        </div>
      )}

      {!isRejected && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleVerify}
            disabled={busy}
            style={{
              flex: 1, height: 36, borderRadius: 8, border: 'none',
              background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
            Aprobar
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            style={{
              flex: 1, height: 36, borderRadius: 8,
              border: '1px solid rgba(239,68,68,.4)', background: 'transparent',
              color: '#f87171', fontSize: 13, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <XCircle size={14} />
            Rechazar
          </button>
        </div>
      )}

      <button
        onClick={handleToggleActive}
        disabled={busy}
        style={{
          height: 34, borderRadius: 8,
          border: doctor.is_active ? '1px solid rgba(239,68,68,.4)' : '1px solid rgba(52,211,153,.4)',
          background: 'transparent',
          color: doctor.is_active ? '#f87171' : '#34d399',
          fontSize: 12, fontWeight: 700,
          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
        }}
      >
        {doctor.is_active ? 'Desactivar usuario' : 'Reactivar usuario'}
      </button>

      <div style={{ fontSize: 11, color: '#334155' }}>
        Registrado: {new Date(doctor.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}
        {doctor.last_login_at ? ` · Último login: ${new Date(doctor.last_login_at).toLocaleDateString('es-GT')}` : ''}
      </div>
    </div>
  )
}

function PasswordTicketRow({ ticket, onUpdate }: {
  ticket: PasswordTicket
  onUpdate: (id: string, status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED', adminNotes?: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState(ticket.admin_notes ?? '')
  const [resetLink, setResetLink] = useState<{ url: string; expiresAt: string } | null>(null)

  async function act(status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED') {
    setBusy(true)
    try {
      await updatePasswordTicket(ticket.id, { status, admin_notes: notes || undefined })
      onUpdate(ticket.id, status, notes || undefined)
    } finally {
      setBusy(false)
    }
  }

  async function issueResetLink() {
    setBusy(true)
    try {
      const result = await issuePasswordResetLink(ticket.id)
      setResetLink({ url: result.data.reset_url, expiresAt: result.data.expires_at })
      onUpdate(ticket.id, 'IN_REVIEW', notes || ticket.admin_notes || undefined)
    } finally {
      setBusy(false)
    }
  }

  const badge = ticket.status === 'OPEN'
    ? { label: 'Abierto', bg: 'rgba(251,191,36,.12)', color: '#fbbf24' }
    : ticket.status === 'IN_REVIEW'
      ? { label: 'En revisión', bg: 'rgba(96,165,250,.12)', color: '#60a5fa' }
      : ticket.status === 'RESOLVED'
        ? { label: 'Resuelto', bg: 'rgba(52,211,153,.12)', color: '#34d399' }
        : { label: 'Rechazado', bg: 'rgba(239,68,68,.12)', color: '#f87171' }

  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            {ticket.requester_name || (ticket.user ? `${ticket.user.first_name} ${ticket.user.last_name}`.trim() : ticket.requester_email)}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{ticket.requester_email}</div>
        </div>
        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: badge.bg, color: badge.color, fontWeight: 500, flexShrink: 0 }}>
          {badge.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Clínica</div>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1 }}>
            {ticket.tenant?.name ?? 'Sin clínica'}
            {ticket.support_context?.tenant_status ? ` · ${planLabels[ticket.support_context.tenant_status.plan_type] ?? ticket.support_context.tenant_status.plan_type}` : ''}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Origen</div>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1 }}>
            {ticket.source === 'AUTHENTICATED_PROFILE' ? 'Perfil autenticado' : 'Login'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {[
          {
            label: 'Usuario',
            value: ticket.support_context?.user_status
              ? `${ticket.support_context.user_status.is_active ? 'Activo' : 'Inactivo'} · ${ticket.support_context.user_status.is_verified ? 'Verificado' : 'No verificado'}`
              : 'No vinculado',
          },
          {
            label: 'Tenant',
            value: ticket.support_context?.tenant_status?.status ?? 'Sin tenant',
          },
          {
            label: 'Tickets abiertos',
            value: String(ticket.support_context?.open_tickets_for_email ?? 0),
          },
          {
            label: 'Último login',
            value: ticket.support_context?.user_status?.last_login_at
              ? new Date(ticket.support_context.user_status.last_login_at).toLocaleDateString('es-GT')
              : 'Sin actividad',
          },
        ].map(item => (
          <div key={item.label} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 10px' }}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {!!ticket.support_context?.recent_audit.length && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 10px' }}>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6 }}>
            Auditoría reciente del tenant
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ticket.support_context.recent_audit.map(event => (
              <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.action} · {event.resource_type}
                </span>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(event.created_at).toLocaleDateString('es-GT')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.message && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
          {ticket.message}
        </div>
      )}

      <textarea
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Notas internas para seguimiento..."
        rows={2}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          borderRadius: 8,
          border: '1px solid #334155',
          background: '#0f172a',
          color: '#cbd5e1',
          padding: '9px 10px',
          fontSize: 12,
          lineHeight: 1.4,
          outline: 'none',
        }}
      />

      {resetLink && (
        <div style={{
          border: '1px solid rgba(96,165,250,.35)',
          background: 'rgba(96,165,250,.09)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>Enlace emitido</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Expira: {new Date(resetLink.expiresAt).toLocaleString('es-GT')}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(resetLink.url)}
            style={ticketButtonStyle('#60a5fa', false)}
          >
            Copiar enlace
          </button>
        </div>
      )}

      {(ticket.status === 'OPEN' || ticket.status === 'IN_REVIEW') && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={issueResetLink} disabled={busy} style={ticketButtonStyle('#f472b6', busy)}>
            Emitir enlace
          </button>
          {ticket.status === 'OPEN' && (
            <button onClick={() => act('IN_REVIEW')} disabled={busy} style={ticketButtonStyle('#60a5fa', busy)}>
              Revisar
            </button>
          )}
          <button onClick={() => act('RESOLVED')} disabled={busy} style={ticketButtonStyle('#16a34a', busy)}>
            Resolver
          </button>
          <button onClick={() => act('REJECTED')} disabled={busy} style={ticketButtonStyle('#ef4444', busy)}>
            Rechazar
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#334155' }}>
        Creado: {new Date(ticket.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

function ticketButtonStyle(color: string, busy: boolean): CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 8,
    border: `1px solid ${color}66`, background: `${color}22`,
    color, fontSize: 12, fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
  }
}

function AuditLogRow({ log }: { log: AdminAuditLog }) {
  const contextAction = typeof log.context?.action === 'string' ? log.context.action : null
  const title = contextAction ?? log.action
  const detail = [
    log.actor_email ?? log.actor_type,
    log.resource_type,
    log.resource_id?.slice(0, 8),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '14px 16px',
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12,
      alignItems: 'start',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FileClock size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detail}
        </div>
        {log.ip_address && (
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            IP {log.ip_address}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
        {new Date(log.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

const planLabels: Record<string, string> = {
  free: 'Sin plan',
  doctor_individual: 'Doctor Individual',
  clinic_complete: 'Clínica Completa',
  pro: 'Pro legacy',
  enterprise: 'Enterprise',
}

const DURATION_OPTIONS: Array<{ value: AccessGrantDuration; label: string }> = [
  { value: '30_days',  label: '30 días'  },
  { value: '365_days', label: '1 año'    },
  { value: 'custom',   label: 'Fecha personalizada' },
]

function FreeAccessPanel({ tenant, onGranted }: {
  tenant: Tenant
  onGranted: (newPlan: PlanType) => void
}) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<Extract<PlanType, 'doctor_individual' | 'clinic_complete'>>('doctor_individual')
  const [duration, setDuration] = useState<AccessGrantDuration>('30_days')
  const [customDate, setCustomDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 20) {
      setError('La justificación debe tener al menos 20 caracteres.')
      return
    }
    if (duration === 'custom' && !customDate) {
      setError('Selecciona una fecha de expiración.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await grantTenantAccess(tenant.id, {
        grant_type: 'manual_override',
        plan_type: plan,
        duration,
        ends_at: duration === 'custom' ? new Date(customDate).toISOString() : undefined,
        reason: reason.trim(),
      })
      onGranted(plan)
      setOpen(false)
      setReason('')
      setDuration('30_days')
      setCustomDate('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al otorgar acceso')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 10, width: '100%', height: 34, borderRadius: 8,
          border: '1px dashed #334155', background: 'transparent',
          color: '#a78bfa', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Gift size={13} /> Conceder acceso sin pago
      </button>
    )
  }

  return (
    <form
      onSubmit={handleGrant}
      style={{
        marginTop: 10, borderRadius: 10,
        border: '1px solid #7c3aed', background: 'rgba(124,58,237,.08)',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Gift size={13} /> Acceso manual sin pago
        </span>
        <button type="button" onClick={() => { setOpen(false); setError('') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {/* Plan + duración */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, display: 'block', marginBottom: 4 }}>Plan</label>
          <select
            value={plan}
            onChange={e => setPlan(e.target.value as typeof plan)}
            style={{ width: '100%', height: 32, borderRadius: 7, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 12, padding: '0 8px' }}
          >
            <option value="doctor_individual">Doctor Individual</option>
            <option value="clinic_complete">Clínica Completa</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, display: 'block', marginBottom: 4 }}>Duración</label>
          <select
            value={duration}
            onChange={e => setDuration(e.target.value as AccessGrantDuration)}
            style={{ width: '100%', height: 32, borderRadius: 7, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 12, padding: '0 8px' }}
          >
            {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {duration === 'custom' && (
        <div>
          <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de expiración</label>
          <input
            type="date"
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            required
            style={{ width: '100%', height: 32, borderRadius: 7, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 12, padding: '0 8px', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Justificación */}
      <div>
        <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Justificación <span style={{ color: '#f87171' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => { setReason(e.target.value); setError('') }}
          placeholder="Explica por qué se concede este acceso sin pago... (mín. 20 caracteres)"
          required
          rows={3}
          style={{
            width: '100%', borderRadius: 7, border: '1px solid #334155',
            background: '#0f172a', color: '#f1f5f9', fontSize: 12,
            padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ fontSize: 11, color: reason.trim().length < 20 ? '#64748b' : '#34d399', marginTop: 2 }}>
          {reason.trim().length}/20 mínimo
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={busy || reason.trim().length < 20}
          style={{
            flex: 1, height: 34, borderRadius: 7, border: 'none',
            background: busy || reason.trim().length < 20 ? '#334155' : '#7c3aed',
            color: busy || reason.trim().length < 20 ? '#64748b' : '#fff',
            fontSize: 12, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Gift size={13} />}
          {busy ? 'Aplicando…' : 'Confirmar acceso'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError('') }}
          style={{ height: 34, padding: '0 14px', borderRadius: 7, border: '1px solid #334155', background: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function CommercialAccountRow({ account, onRefresh }: {
  account: CommercialAccount
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [draftDuration, setDraftDuration] = useState<AccessGrantDuration | null>(null)
  const [draftPlan, setDraftPlan] = useState<Extract<PlanType, 'doctor_individual' | 'clinic_complete'>>('clinic_complete')
  const [draftEndsAt, setDraftEndsAt] = useState('')
  const [draftReason, setDraftReason] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftMaxAi, setDraftMaxAi] = useState('')
  const [draftMaxOrganizations, setDraftMaxOrganizations] = useState('')
  const [draftMaxStaff, setDraftMaxStaff] = useState('')
  const [draftMaxPatients, setDraftMaxPatients] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [formError, setFormError] = useState('')
  const { tenant, owner, active_grant: activeGrant, usage } = account
  const aiLimit = usage.ai.limit === -1 ? '∞' : usage.ai.limit.toLocaleString('es-GT')
  const aiUsed = usage.ai.used.toLocaleString('es-GT')
  const trialEnds = activeGrant ? new Date(activeGrant.ends_at) : null
  const stateBadge = commercialStateBadge(account.commercial_state.trial_status)
  const latestInvoice = account.billing.latest_invoice
  const pendingInvoice = account.billing.latest_pending_invoice

  function startGrant(duration: AccessGrantDuration) {
    setDraftDuration(duration)
    setFormError('')
    setDraftReason('')
    setDraftNotes('')
    setDraftEndsAt('')
    setDraftMaxAi('')
    setDraftMaxOrganizations('')
    setDraftMaxStaff('')
    setDraftMaxPatients('')
  }

  async function submitGrant() {
    if (!draftDuration) return
    if (draftReason.trim().length < 10) {
      setFormError('Agrega una razón comercial de al menos 10 caracteres.')
      return
    }
    if (draftDuration === 'custom' && !draftEndsAt) {
      setFormError('Selecciona la fecha final para la prueba personalizada.')
      return
    }

    setBusy(true)
    setFormError('')
    try {
      await grantTenantAccess(tenant.id, {
        grant_type: 'trial',
        plan_type: draftPlan,
        duration: draftDuration,
        ends_at: draftDuration === 'custom' ? new Date(draftEndsAt).toISOString() : undefined,
        reason: draftReason.trim(),
        notes: draftNotes.trim() || undefined,
        max_ai_units_monthly: parseOptionalPositiveInt(draftMaxAi),
        max_organizations: parseOptionalPositiveInt(draftMaxOrganizations),
        max_staff: parseOptionalPositiveInt(draftMaxStaff),
        max_patients: parseOptionalPositiveInt(draftMaxPatients),
      })
      setDraftDuration(null)
      await onRefresh()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo conceder la prueba.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!activeGrant) return
    if (revokeReason.trim().length < 10) {
      setFormError('Agrega una razón de revocación de al menos 10 caracteres.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      await revokeTenantAccessGrant(activeGrant.id, revokeReason.trim())
      setRevokeReason('')
      await onRefresh()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo revocar la prueba.')
    } finally {
      setBusy(false)
    }
  }

  async function markPendingInvoicePaid() {
    if (!pendingInvoice) return
    setBusy(true)
    setFormError('')
    try {
      await markAdminInvoicePaid(pendingInvoice.id, invoiceNotes.trim() || undefined)
      setInvoiceNotes('')
      await onRefresh()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo marcar la factura como pagada.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelPendingInvoice() {
    if (!pendingInvoice) return
    setBusy(true)
    setFormError('')
    try {
      await cancelAdminInvoice(pendingInvoice.id, invoiceNotes.trim() || undefined)
      setInvoiceNotes('')
      await onRefresh()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo cancelar la factura.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 10,
      padding: '16px 18px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.35fr) minmax(220px, .85fr)',
      gap: 18,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenant.name}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              /{tenant.slug} · {owner ? `${owner.first_name} ${owner.last_name}` : 'Sin owner'}
            </div>
          </div>
          <span style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 999,
            background: stateBadge.bg,
            color: stateBadge.color,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {stateBadge.label}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 14 }}>
          {[
            { label: 'Plan efectivo', value: planLabels[usage.ai.plan] ?? usage.ai.plan },
            { label: 'Organizaciones', value: usage.organizations.toLocaleString('es-GT') },
            { label: 'Staff', value: usage.staff.toLocaleString('es-GT') },
            { label: 'Pacientes', value: usage.patients.toLocaleString('es-GT') },
            { label: 'IA mensual', value: `${aiUsed} / ${aiLimit}` },
            { label: 'Cobrado', value: formatGTQ(account.billing.revenue_paid_gtq) },
            { label: 'Pendiente', value: formatGTQ(account.billing.revenue_pending_gtq) },
          ].map(item => (
            <div key={item.label} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {activeGrant && trialEnds && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Acceso temporal hasta <strong style={{ color: '#f8fafc' }}>{trialEnds.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            {account.commercial_state.days_remaining !== null ? ` · ${account.commercial_state.days_remaining} días restantes` : ''}
            {activeGrant.reason ? ` · ${activeGrant.reason}` : ''}
          </div>
        )}

        {account.grant_history.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Historial reciente</div>
            {account.grant_history.slice(0, 3).map(grant => (
              <div key={grant.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {planLabels[grant.plan_type] ?? grant.plan_type} · {grant.status}
                </span>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                  {new Date(grant.ends_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {latestInvoice && (
          <div style={{ marginTop: 12, border: '1px solid #334155', borderRadius: 8, background: '#0f172a', padding: '9px 11px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800 }}>Última factura</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {latestInvoice.invoice_number} · {latestInvoice.status} · {latestInvoice.provider}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#f8fafc', fontWeight: 800, whiteSpace: 'nowrap' }}>
              {formatGTQ(Number(latestInvoice.amount_gtq))}
            </div>
          </div>
        )}

        {pendingInvoice && (
          <div style={{ marginTop: 10, border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, background: 'rgba(251,191,36,.08)', padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800 }}>Factura pendiente</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pendingInvoice.invoice_number} · {planLabels[pendingInvoice.plan_type] ?? pendingInvoice.plan_type}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#f8fafc', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {formatGTQ(Number(pendingInvoice.amount_gtq))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={invoiceNotes}
                onChange={event => setInvoiceNotes(event.target.value)}
                placeholder="Nota interna"
                style={{ ...commercialInputStyle, flex: 1, minWidth: 0 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={markPendingInvoicePaid} disabled={busy} style={{ ...commercialButtonStyle('#34d399', busy), flex: 1 }}>
                Marcar pagada
              </button>
              <button onClick={cancelPendingInvoice} disabled={busy} style={commercialButtonStyle('#ef4444', busy)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>
          <Gift size={15} color="#f472b6" />
          Acceso de prueba
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {([
            ['1_day', '1 día'],
            ['7_days', '1 semana'],
            ['30_days', '1 mes'],
            ['365_days', '1 año'],
            ['custom', 'Personalizada'],
          ] as Array<[AccessGrantDuration, string]>).map(([duration, label]) => (
            <button
              key={duration}
              onClick={() => startGrant(duration)}
              disabled={busy}
              style={commercialButtonStyle(draftDuration === duration ? '#f472b6' : '#60a5fa', busy)}
            >
              {label}
            </button>
          ))}
        </div>

        {draftDuration && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setDraftPlan('doctor_individual')}
                style={commercialButtonStyle(draftPlan === 'doctor_individual' ? '#34d399' : '#64748b', busy)}
              >
                Doctor
              </button>
              <button
                type="button"
                onClick={() => setDraftPlan('clinic_complete')}
                style={commercialButtonStyle(draftPlan === 'clinic_complete' ? '#34d399' : '#64748b', busy)}
              >
                Clínica
              </button>
            </div>

            {draftDuration === 'custom' && (
              <input
                type="datetime-local"
                value={draftEndsAt}
                onChange={event => setDraftEndsAt(event.target.value)}
                style={commercialInputStyle}
              />
            )}

            <textarea
              value={draftReason}
              onChange={event => setDraftReason(event.target.value)}
              placeholder="Razón comercial de la prueba"
              rows={2}
              style={{ ...commercialInputStyle, minHeight: 64, resize: 'vertical' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={draftMaxOrganizations} onChange={event => setDraftMaxOrganizations(event.target.value)} placeholder="Orgs max." inputMode="numeric" style={commercialInputStyle} />
              <input value={draftMaxAi} onChange={event => setDraftMaxAi(event.target.value)} placeholder="IA max." inputMode="numeric" style={commercialInputStyle} />
              <input value={draftMaxStaff} onChange={event => setDraftMaxStaff(event.target.value)} placeholder="Staff max." inputMode="numeric" style={commercialInputStyle} />
              <input value={draftMaxPatients} onChange={event => setDraftMaxPatients(event.target.value)} placeholder="Pacientes max." inputMode="numeric" style={commercialInputStyle} />
            </div>

            <input
              value={draftNotes}
              onChange={event => setDraftNotes(event.target.value)}
              placeholder="Notas internas opcionales"
              style={commercialInputStyle}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitGrant} disabled={busy} style={{ ...commercialButtonStyle('#34d399', busy), flex: 1 }}>
                Conceder
              </button>
              <button onClick={() => setDraftDuration(null)} disabled={busy} style={commercialButtonStyle('#64748b', busy)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {activeGrant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={revokeReason}
              onChange={event => setRevokeReason(event.target.value)}
              placeholder="Razón para revocar"
              style={commercialInputStyle}
            />
            <button
              onClick={revoke}
              disabled={busy}
              style={{ ...commercialButtonStyle('#ef4444', busy), width: '100%' }}
            >
              Revocar prueba
            </button>
          </div>
        )}

        {formError && (
          <div style={{ fontSize: 12, color: '#f87171', lineHeight: 1.4 }}>
            {formError}
          </div>
        )}
      </div>
    </div>
  )
}

function commercialButtonStyle(color: string, busy: boolean): CSSProperties {
  return {
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${color}66`,
    background: `${color}18`,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }
}

function commercialStateBadge(status: CommercialAccount['commercial_state']['trial_status']) {
  if (status === 'active') return { label: 'Prueba activa', bg: 'rgba(52,211,153,.12)', color: '#34d399' }
  if (status === 'expiring') return { label: 'Por vencer', bg: 'rgba(251,191,36,.13)', color: '#fbbf24' }
  if (status === 'expired') return { label: 'Prueba vencida', bg: 'rgba(239,68,68,.12)', color: '#f87171' }
  if (status === 'converted') return { label: 'Convertida', bg: 'rgba(167,139,250,.14)', color: '#a78bfa' }
  return { label: 'Sin prueba', bg: 'rgba(96,165,250,.12)', color: '#60a5fa' }
}

function formatGTQ(value: number) {
  return `Q${value.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`
}

function CommercialSummaryCards({ summary }: { summary: CommercialSummary | null }) {
  const cards = [
    { label: 'Trials activas', value: summary?.trials.active ?? 0, color: '#34d399' },
    { label: 'Por vencer', value: summary?.trials.expiring ?? 0, color: '#fbbf24' },
    { label: 'Convertidas', value: summary?.trials.converted ?? 0, color: '#a78bfa' },
    { label: 'Conversión', value: `${summary?.trials.conversion_rate ?? 0}%`, color: '#60a5fa' },
    { label: 'Tenants pagados', value: summary?.paid_tenants.total ?? 0, color: '#f472b6' },
    { label: 'Cobrado total', value: formatGTQ(summary?.revenue.paid_total_gtq ?? 0), color: '#34d399' },
    { label: 'Cobrado mes', value: formatGTQ(summary?.revenue.paid_this_month_gtq ?? 0), color: '#60a5fa' },
    { label: 'Pendiente', value: formatGTQ(summary?.revenue.pending_gtq ?? 0), color: '#fbbf24' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
      {cards.map(card => (
        <div key={card.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 800 }}>{card.label}</div>
          <div style={{ fontSize: 22, color: card.color, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
        </div>
      ))}
    </div>
  )
}

const commercialInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#020617',
  color: '#cbd5e1',
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.4,
  outline: 'none',
}

function parseOptionalPositiveInt(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Los overrides numéricos deben ser enteros positivos.')
  }
  return parsed
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('pending')
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [doctors, setDoctors] = useState<PendingDoctor[]>([])
  const [userFilter, setUserFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantSearch, setTenantSearch] = useState('')
  const [tenantStatusFilter, setTenantStatusFilter] = useState<Tenant['status'] | 'all'>('all')
  const [commercialAccounts, setCommercialAccounts] = useState<CommercialAccount[]>([])
  const [commercialSummary, setCommercialSummary] = useState<CommercialSummary | null>(null)
  const [commercialFilter, setCommercialFilter] = useState<CommercialAccount['commercial_state']['trial_status'] | 'all'>('all')
  const [commercialSearch, setCommercialSearch] = useState('')
  const [tickets, setTickets] = useState<PasswordTicket[]>([])
  const [ticketFilter, setTicketFilter] = useState<PasswordTicketStatus | 'all'>('OPEN')
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [m, u, t, commercial, pt, audit] = await Promise.all([
        fetchMetrics(),
        fetchUsers(userFilter),
        fetchTenants(),
        fetchCommercialAccounts(),
        fetchPasswordTickets(ticketFilter),
        fetchAdminAuditLogs(),
      ])
      setMetrics(m.data)
      setDoctors(u.data)
      setTenants(t.data)
      setCommercialAccounts(commercial.data)
      setCommercialSummary(commercial.summary)
      setTickets(pt.data)
      setAuditLogs(audit.data)
    } catch {
      await clearAdminSession()
      router.replace('/admin/login')
    } finally {
      setLoading(false)
    }
  }, [router, ticketFilter, userFilter])

  useEffect(() => { loadData() }, [loadData])

  async function handleLogout() {
    await clearAdminSession()
    router.replace('/admin/login')
  }

  function removeDoctor(id: string) {
    setDoctors(prev => prev.filter(d => d.id !== id))
    if (metrics) setMetrics({ ...metrics, doctors: { ...metrics.doctors, pending_verification: Math.max(0, metrics.doctors.pending_verification - 1) } })
  }

  function updateDoctorStatus(id: string, isActive: boolean) {
    setDoctors(prev => prev.map(d => d.id === id ? { ...d, is_active: isActive } : d))
  }

  async function handleTenantStatus(id: string, status: 'active' | 'suspended') {
    const reason = status === 'suspended'
      ? window.prompt('Razón para suspender este tenant (mínimo 10 caracteres):')
      : window.prompt('Nota interna de reactivación (opcional):') ?? undefined
    if (status === 'suspended' && (!reason || reason.trim().length < 10)) return
    await updateTenant(id, { status, reason: reason?.trim() || undefined })
    setTenants(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function handleExpireGrants() {
    await expireCommercialAccessGrants()
    await loadData()
  }

  const visibleCommercialAccounts = commercialAccounts.filter(account => {
    const matchesStatus = commercialFilter === 'all' || account.commercial_state.trial_status === commercialFilter
    const q = commercialSearch.trim().toLowerCase()
    const matchesSearch = !q
      || account.tenant.name.toLowerCase().includes(q)
      || account.tenant.slug.toLowerCase().includes(q)
      || account.owner?.email.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  const visibleTenants = tenants.filter(tenant => {
    const matchesStatus = tenantStatusFilter === 'all' || tenant.status === tenantStatusFilter
    const q = tenantSearch.trim().toLowerCase()
    const ownerName = tenant.owner ? `${tenant.owner.first_name} ${tenant.owner.last_name} ${tenant.owner.email}`.toLowerCase() : ''
    const matchesSearch = !q
      || tenant.name.toLowerCase().includes(q)
      || tenant.slug.toLowerCase().includes(q)
      || ownerName.includes(q)
    return matchesStatus && matchesSearch
  })

  function updateTicket(id: string, status: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED', adminNotes?: string) {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status, admin_notes: adminNotes ?? t.admin_notes, updated_at: new Date().toISOString() } : t))
    if (metrics) {
      const wasOpen = tickets.find(t => t.id === id)?.status === 'OPEN'
      if (wasOpen) {
        setMetrics({ ...metrics, tickets: { password_open: Math.max(0, metrics.tickets.password_open - 1) } })
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', fontFamily: 'var(--mt-font)', color: '#f1f5f9' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1e293b', padding: '0 clamp(16px, 4vw, 40px)',
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: '#0f172a', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={18} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Meditrack Admin</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid #334155',
            borderRadius: 8, padding: '6px 12px', fontSize: 13,
            color: '#94a3b8', cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          Salir
        </button>
      </header>

      <main style={{ padding: 'clamp(16px, 4vw, 40px)', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={28} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
              <StatCard label="Doctores registrados" value={metrics?.doctors.total ?? 0} icon={Users} accent="#60a5fa" />
              <StatCard label="Pendientes de verificación" value={metrics?.doctors.pending_verification ?? 0} icon={Clock} accent="#fbbf24" />
              <StatCard label="Tenants totales" value={metrics?.tenants.total ?? 0} icon={Building2} accent="#a78bfa" />
              <StatCard label="Tenants activos" value={metrics?.tenants.active ?? 0} icon={CheckCircle2} accent="#34d399" />
              <StatCard label="Tickets de contraseña" value={metrics?.tickets.password_open ?? 0} icon={KeyRound} accent="#f472b6" />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
              {[
                { key: 'pending' as Tab, label: 'Usuarios médicos', badge: metrics?.doctors.pending_verification },
                { key: 'tickets' as Tab, label: 'Tickets', badge: metrics?.tickets.password_open },
                { key: 'tenants' as Tab, label: 'Tenants' },
                { key: 'commercial' as Tab, label: 'Control comercial' },
                { key: 'audit' as Tab, label: 'Auditoría' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 500,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === t.key ? '#60a5fa' : '#64748b',
                    borderBottom: tab === t.key ? '2px solid #60a5fa' : '2px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'color .15s',
                  }}
                >
                  {t.label}
                  {t.badge !== undefined && t.badge > 0 && (
                    <span style={{
                      background: '#fbbf24', color: '#0f172a',
                      fontSize: 10, fontWeight: 700, padding: '1px 7px',
                      borderRadius: 999,
                    }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            {tab === 'pending' && (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {([
                    ['pending', 'Pendientes'],
                    ['verified', 'Verificados'],
                    ['rejected', 'Rechazados'],
                    ['all', 'Todos'],
                  ] as Array<['pending' | 'verified' | 'rejected' | 'all', string]>).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setUserFilter(value)}
                      style={{
                        height: 32,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: userFilter === value ? '1px solid #60a5fa' : '1px solid #334155',
                        background: userFilter === value ? 'rgba(96,165,250,.12)' : 'transparent',
                        color: userFilter === value ? '#60a5fa' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {doctors.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: 60, color: '#475569' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin usuarios en este filtro</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                    {doctors.map(d => (
                      <DoctorRow
                        key={d.id}
                        doctor={d}
                        onVerify={removeDoctor}
                        onReject={removeDoctor}
                        onStatusChange={updateDoctorStatus}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'tickets' && (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {([
                    ['OPEN', 'Abiertos'],
                    ['IN_REVIEW', 'En revisión'],
                    ['RESOLVED', 'Resueltos'],
                    ['REJECTED', 'Rechazados'],
                    ['all', 'Todos'],
                  ] as Array<[PasswordTicketStatus | 'all', string]>).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setTicketFilter(value)}
                      style={{
                        height: 32,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: ticketFilter === value ? '1px solid #60a5fa' : '1px solid #334155',
                        background: ticketFilter === value ? 'rgba(96,165,250,.12)' : 'transparent',
                        color: ticketFilter === value ? '#60a5fa' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tickets.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: 60, color: '#475569' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin tickets de contraseña</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                    {tickets.map(ticket => (
                      <PasswordTicketRow
                        key={ticket.id}
                        ticket={ticket}
                        onUpdate={updateTicket}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'tenants' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <input
                    value={tenantSearch}
                    onChange={event => setTenantSearch(event.target.value)}
                    placeholder="Buscar tenant, slug u owner"
                    style={{ ...commercialInputStyle, width: 'min(100%, 300px)', height: 34 }}
                  />
                  {([
                    ['all', 'Todos'],
                    ['active', 'Activos'],
                    ['suspended', 'Suspendidos'],
                    ['cancelled', 'Cancelados'],
                  ] as Array<[Tenant['status'] | 'all', string]>).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setTenantStatusFilter(value)}
                      style={commercialButtonStyle(tenantStatusFilter === value ? '#60a5fa' : '#64748b', false)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {visibleTenants.map(tenant => (
                  <div
                    key={tenant.id}
                    style={{
                      background: '#1e293b', border: '1px solid #334155',
                      borderRadius: 10, padding: '16px 18px',
                      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 16, alignItems: 'start',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{tenant.name}</div>
                        <span style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 700,
                          background: tenant.status === 'active' ? 'rgba(52,211,153,.12)' : tenant.status === 'suspended' ? 'rgba(251,191,36,.12)' : 'rgba(239,68,68,.12)',
                          color: tenant.status === 'active' ? '#34d399' : tenant.status === 'suspended' ? '#fbbf24' : '#f87171',
                        }}>
                          {tenant.status === 'active' ? 'Activo' : tenant.status === 'suspended' ? 'Suspendido' : 'Cancelado'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>/{tenant.slug} · {planLabels[tenant.plan_type] ?? tenant.plan_type}</div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12 }}>
                        {[
                          { label: 'Owner', value: tenant.owner ? `${tenant.owner.first_name} ${tenant.owner.last_name}` : 'Sin owner' },
                          { label: 'Staff activo', value: String(tenant.usage?.staff ?? 0) },
                          { label: 'Pacientes', value: String(tenant.usage?.patients ?? 0) },
                          { label: 'Último login', value: tenant.last_login_at ? new Date(tenant.last_login_at).toLocaleDateString('es-GT') : 'Sin actividad' },
                        ].map(item => (
                          <div key={item.label} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '9px 10px' }}>
                            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{item.label}</div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      {tenant.plan_type === 'free' && (
                        <FreeAccessPanel
                          tenant={tenant}
                          onGranted={newPlan => setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, plan_type: newPlan } : t))}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      {/* Plan selector */}
                      <select
                        value={tenant.plan_type}
                        onChange={async e => {
                          const plan = e.target.value as Tenant['plan_type']
                          if (plan === tenant.plan_type) return
                          await updateTenant(tenant.id, { plan_type: plan })
                          setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, plan_type: plan } : t))
                        }}
                        style={{
                          height: 32, padding: '0 10px', borderRadius: 8,
                          border: '1px solid #334155', background: '#0f172a',
                          color: '#60a5fa', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', minWidth: 150,
                        }}
                      >
                        <option value="free">Gratuito</option>
                        <option value="doctor_individual">Doctor Individual</option>
                        <option value="clinic_complete">Clínica Completa</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                      {/* Status toggle */}
                      <button
                        onClick={() => handleTenantStatus(tenant.id, tenant.status === 'active' ? 'suspended' : 'active')}
                        disabled={tenant.status === 'cancelled'}
                        style={{
                          height: 32, padding: '0 14px', borderRadius: 8,
                          border: '1px solid #334155', background: 'transparent',
                          color: tenant.status === 'cancelled' ? '#475569' : '#94a3b8', fontSize: 12, fontWeight: 700,
                          cursor: tenant.status === 'cancelled' ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        {tenant.status === 'active' ? <><AlertTriangle size={13} />Suspender</> : <><CheckCircle2 size={13} />Activar</>}
                      </button>
                    </div>
                  </div>
                ))}
                {visibleTenants.length === 0 && (
                  <div style={{ textAlign: 'center', paddingTop: 56, color: '#475569' }}>
                    <Building2 size={34} color="#64748b" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin tenants en este filtro</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'commercial' && (
              <div>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(96,165,250,.12), rgba(244,114,182,.10))',
                  border: '1px solid #334155',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Sparkles size={16} color="#f472b6" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>Pruebas, acceso temporal y consumo</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        Control super admin para cuentas demo, promos, límites de IA y operación por organización.
                      </div>
                    </div>
                  </div>
                  <button onClick={handleExpireGrants} style={{ ...commercialButtonStyle('#f472b6', false), flexShrink: 0 }}>
                    Actualizar vencidas
                  </button>
                </div>

                <CommercialSummaryCards summary={commercialSummary} />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <input
                    value={commercialSearch}
                    onChange={event => setCommercialSearch(event.target.value)}
                    placeholder="Buscar clínica, slug o email"
                    style={{ ...commercialInputStyle, width: 'min(100%, 280px)', height: 34 }}
                  />
                  {([
                    ['all', 'Todos'],
                    ['active', 'Activas'],
                    ['expiring', 'Por vencer'],
                    ['expired', 'Vencidas'],
                    ['converted', 'Convertidas'],
                    ['none', 'Sin prueba'],
                  ] as Array<[CommercialAccount['commercial_state']['trial_status'] | 'all', string]>).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setCommercialFilter(value)}
                      style={commercialButtonStyle(commercialFilter === value ? '#60a5fa' : '#64748b', false)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {visibleCommercialAccounts.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: 60, color: '#475569' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin cuentas comerciales</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {visibleCommercialAccounts.map(account => (
                      <CommercialAccountRow
                        key={account.tenant.id}
                        account={account}
                        onRefresh={loadData}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'audit' && (
              <div>
                {auditLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: 60, color: '#475569' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin eventos de auditoría</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {auditLogs.map(log => (
                      <AuditLogRow key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
