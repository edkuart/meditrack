'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, ChevronLeft, ChevronRight, Loader2, Filter } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getAuditLogs, type AuditLogEntry, type AuditLogPage } from '@/lib/doctor/settings-api'
import { MTButton } from '@/components/doctor/clinical-ui'

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Inicio de sesión', LOGIN_FAILURE: 'Intento fallido',
  LOGOUT: 'Cierre de sesión', TOKEN_REFRESH: 'Token renovado',
  PATIENT_CREATED: 'Paciente creado', PATIENT_UPDATED: 'Paciente actualizado',
  PATIENT_VIEWED: 'Paciente consultado', ENCOUNTER_OPENED: 'Consulta abierta',
  ENCOUNTER_CLOSED: 'Consulta cerrada', TREATMENT_CREATED: 'Tratamiento creado',
  TREATMENT_ACTIVATED: 'Tratamiento activado', TREATMENT_SUSPENDED: 'Tratamiento suspendido',
  DOCUMENT_UPLOADED: 'Documento subido', DOCUMENT_VIEWED: 'Documento consultado',
  DOCUMENT_DELETED: 'Documento eliminado', USER_INVITED: 'Miembro invitado',
  USER_DEACTIVATED: 'Miembro desactivado', SETTINGS_CHANGED: 'Configuración cambiada',
  DOSE_CONFIRMED: 'Dosis confirmada', BILLING_CHECKOUT_STARTED: 'Checkout iniciado',
  BILLING_PLAN_CHANGED: 'Plan actualizado', AI_ASSIST_USED: 'IA utilizada',
  EXPORT_REQUESTED: 'Exportación solicitada',
}

const ACTION_TONE: Record<string, { bg: string; color: string }> = {
  LOGIN_FAILURE:           { bg: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)' },
  USER_DEACTIVATED:        { bg: '#FEF3C7', color: '#92400E' },
  DOCUMENT_DELETED:        { bg: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)' },
  SETTINGS_CHANGED:        { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)' },
  BILLING_CHECKOUT_STARTED:{ bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)' },
}

const DEFAULT_TONE = { bg: 'var(--mt-elevated)', color: 'var(--mt-text-2)' }

const FILTER_ACTIONS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'PATIENT_CREATED', 'PATIENT_VIEWED',
  'ENCOUNTER_OPENED', 'ENCOUNTER_CLOSED', 'TREATMENT_CREATED', 'TREATMENT_ACTIVATED',
  'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'USER_INVITED', 'SETTINGS_CHANGED',
]

function ActionPill({ action }: { action: string }) {
  const tone = ACTION_TONE[action] ?? DEFAULT_TONE
  return (
    <span style={{
      display: 'inline-block', borderRadius: 999,
      padding: '2px 8px', fontSize: 11, fontWeight: 500,
      background: tone.bg, color: tone.color,
    }}>
      {ACTION_LABELS[action] ?? action}
    </span>
  )
}

function LogRow({ log }: { log: AuditLogEntry }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--mt-border)', transition: 'background .1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {new Date(log.created_at).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td style={{ padding: '10px 16px' }}>
        <ActionPill action={log.action} />
      </td>
      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--mt-text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {log.actor_email ?? log.actor_id.slice(0, 8) + '…'}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)' }}>
        {log.resource_type}
        {log.resource_id && (
          <span style={{ marginLeft: 4, fontFamily: 'monospace' }}>
            {log.resource_id.slice(0, 8)}…
          </span>
        )}
      </td>
    </tr>
  )
}

export default function AuditLogPage() {
  const { token } = useAuth()
  const [data, setData] = useState<AuditLogPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setData(await getAuditLogs(token, { page, limit: 50, action: actionFilter || undefined }))
    } catch { /* silent */ } finally { setLoading(false) }
  }, [token, page, actionFilter])

  useEffect(() => { load() }, [load])

  function handleFilterChange(value: string) { setActionFilter(value); setPage(1) }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={22} color="var(--mt-muted)" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Registro de auditoría</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Historial completo de acciones realizadas en la clínica.</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Filter size={15} color="var(--mt-muted)" />
        <select
          value={actionFilter}
          onChange={e => handleFilterChange(e.target.value)}
          style={{
            border: '1px solid var(--mt-border)', borderRadius: 8,
            background: 'var(--mt-surface)', padding: '7px 12px',
            fontSize: 13, color: 'var(--mt-text)', outline: 'none',
            fontFamily: 'var(--mt-font)',
          }}
        >
          <option value="">Todas las acciones</option>
          {FILTER_ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
        {data && <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{data.meta.total.toLocaleString()} registros</span>}
      </div>

      <div style={{ borderRadius: 14, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 20px' }}>
            <Loader2 size={20} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : data?.logs.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>
            No hay registros para el filtro seleccionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--mt-border)', background: 'var(--mt-elevated)' }}>
                  {['Fecha', 'Acción', 'Actor', 'Recurso'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mt-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.logs.map(log => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.meta.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <p style={{ color: 'var(--mt-text-2)', margin: 0 }}>
            Página {data.meta.page} de {data.meta.pages}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <MTButton variant="outline" size="sm" icon={ChevronLeft}
              disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              Anterior
            </MTButton>
            <MTButton variant="outline" size="sm" iconRight={ChevronRight}
              disabled={page >= data.meta.pages} onClick={() => setPage(p => Math.min(data.meta.pages, p + 1))}>
              Siguiente
            </MTButton>
          </div>
        </div>
      )}
    </div>
  )
}
