'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, ChevronLeft, ChevronRight, Loader2, Filter } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getAuditLogs, type AuditLogEntry, type AuditLogPage } from '@/lib/doctor/settings-api'

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Inicio de sesión',
  LOGIN_FAILURE: 'Intento fallido',
  LOGOUT: 'Cierre de sesión',
  TOKEN_REFRESH: 'Token renovado',
  PATIENT_CREATED: 'Paciente creado',
  PATIENT_UPDATED: 'Paciente actualizado',
  PATIENT_VIEWED: 'Paciente consultado',
  ENCOUNTER_OPENED: 'Consulta abierta',
  ENCOUNTER_CLOSED: 'Consulta cerrada',
  TREATMENT_CREATED: 'Tratamiento creado',
  TREATMENT_ACTIVATED: 'Tratamiento activado',
  TREATMENT_SUSPENDED: 'Tratamiento suspendido',
  DOCUMENT_UPLOADED: 'Documento subido',
  DOCUMENT_VIEWED: 'Documento consultado',
  DOCUMENT_DELETED: 'Documento eliminado',
  USER_INVITED: 'Miembro invitado',
  USER_DEACTIVATED: 'Miembro desactivado',
  SETTINGS_CHANGED: 'Configuración cambiada',
  DOSE_CONFIRMED: 'Dosis confirmada',
  BILLING_CHECKOUT_STARTED: 'Checkout iniciado',
  BILLING_PLAN_CHANGED: 'Plan actualizado',
  AI_ASSIST_USED: 'IA utilizada',
  EXPORT_REQUESTED: 'Exportación solicitada',
}

const ACTION_TONE: Record<string, string> = {
  LOGIN_FAILURE: 'text-red-600 bg-red-50',
  USER_DEACTIVATED: 'text-amber-700 bg-amber-50',
  DOCUMENT_DELETED: 'text-red-600 bg-red-50',
  SETTINGS_CHANGED: 'text-blue-700 bg-blue-50',
  BILLING_CHECKOUT_STARTED: 'text-blue-700 bg-blue-50',
}

const FILTER_ACTIONS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'PATIENT_CREATED', 'PATIENT_VIEWED',
  'ENCOUNTER_OPENED', 'ENCOUNTER_CLOSED', 'TREATMENT_CREATED', 'TREATMENT_ACTIVATED',
  'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'USER_INVITED', 'SETTINGS_CHANGED',
]

function ActionPill({ action }: { action: string }) {
  const tone = ACTION_TONE[action] ?? 'text-slate-600 bg-slate-100'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {ACTION_LABELS[action] ?? action}
    </span>
  )
}

function LogRow({ log }: { log: AuditLogEntry }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap tabular-nums">
        {new Date(log.created_at).toLocaleString('es', {
          month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </td>
      <td className="px-4 py-3">
        <ActionPill action={log.action} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 max-w-[180px] truncate">
        {log.actor_email ?? log.actor_id.slice(0, 8) + '…'}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {log.resource_type}
        {log.resource_id && (
          <span className="ml-1 font-mono">
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
      const result = await getAuditLogs(token, {
        page,
        limit: 50,
        action: actionFilter || undefined,
      })
      setData(result)
    } catch {
      // error silently
    } finally {
      setLoading(false)
    }
  }, [token, page, actionFilter])

  useEffect(() => { load() }, [load])

  function handleFilterChange(value: string) {
    setActionFilter(value)
    setPage(1)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck size={22} className="text-slate-400" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Registro de auditoría</h1>
          <p className="text-sm text-slate-500">
            Historial completo de acciones realizadas en la clínica.
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={15} className="text-slate-400" />
        <select
          value={actionFilter}
          onChange={e => handleFilterChange(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todas las acciones</option>
          {FILTER_ACTIONS.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
        {data && (
          <span className="text-xs text-slate-400">
            {data.meta.total.toLocaleString()} registros
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : data?.logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No hay registros para el filtro seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Acción</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Actor</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Recurso</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs.map(log => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">
            Página {data.meta.page} de {data.meta.pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(data.meta.pages, p + 1))}
              disabled={page >= data.meta.pages}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
