'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical, ArrowLeft, Save, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getLabOrder, updateLabOrder, upsertLabResults,
  STATUS_CONFIG, ORDER_STATUS_CONFIG,
  type LabOrder, type LabOrderStatus, type LabResult, type LabResultInput,
} from '@/lib/doctor/lab-api'
import { ClinicalPage, ClinicalHeader, ClinicalButton, LoadingState } from '@/components/doctor/clinical-ui'
import { cn } from '@/lib/utils'

// ─── Status badge ─────────────────────────────────────────────────────────────

function ResultStatusBadge({ status }: { status: LabResult['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Result row (editable) ─────────────────────────────────────────────────────

interface EditRow {
  id: string
  panel_name: string
  parameter_name: string
  unit: string | null
  ref_min: string | null
  ref_max: string | null
  ref_text: string | null
  sort_order: number
  value: string
}

function buildEditRows(results: LabResult[]): EditRow[] {
  return results.map(r => ({
    id:             r.id,
    panel_name:     r.panel_name,
    parameter_name: r.parameter_name,
    unit:           r.unit,
    ref_min:        r.ref_min,
    ref_max:        r.ref_max,
    ref_text:       r.ref_text,
    sort_order:     r.sort_order,
    value:          r.numeric_value ?? r.value ?? '',
  }))
}

function computeLocalStatus(
  value: string,
  refMin: string | null,
  refMax: string | null,
): LabResult['status'] {
  const num = parseFloat(value)
  if (isNaN(num) || value === '') return 'PENDING'
  const min = refMin != null ? parseFloat(refMin) : null
  const max = refMax != null ? parseFloat(refMax) : null
  if (min != null && num < min) return num < min * 0.7 ? 'CRITICAL_LOW' : 'LOW'
  if (max != null && num > max) return num > max * 1.3 ? 'CRITICAL_HIGH' : 'HIGH'
  if (min != null || max != null) return 'NORMAL'
  return 'PENDING'
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LabOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<LabOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<EditRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)

  useEffect(() => {
    if (!token || !id) return
    getLabOrder(token, id)
      .then(o => {
        setOrder(o)
        setRows(buildEditRows(o.results))
      })
      .finally(() => setLoading(false))
  }, [token, id])

  function handleValueChange(idx: number, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, value: val } : r))
    setDirty(true)
  }

  async function saveResults() {
    if (!token || !order) return
    setSaving(true)
    setError('')
    try {
      const results: LabResultInput[] = rows.map(r => ({
        panel_name:     r.panel_name,
        parameter_name: r.parameter_name,
        unit:           r.unit ?? undefined,
        ref_min:        r.ref_min != null ? Number(r.ref_min) : undefined,
        ref_max:        r.ref_max != null ? Number(r.ref_max) : undefined,
        ref_text:       r.ref_text ?? undefined,
        sort_order:     r.sort_order,
        ...(r.value !== '' && !isNaN(Number(r.value))
          ? { numeric_value: Number(r.value), value: r.value }
          : { value: r.value || undefined }),
      }))
      const updated = await upsertLabResults(token, order.id, results)
      setOrder(updated)
      setRows(buildEditRows(updated.results))
      setDirty(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelOrder() {
    if (!token || !order) return
    setSaving(true)
    try {
      const updated = await updateLabOrder(token, order.id, { status: 'CANCELLED' as LabOrderStatus })
      setOrder(updated)
    } finally {
      setSaving(false)
      setCancelOpen(false)
    }
  }

  if (loading) {
    return (
      <ClinicalPage>
        <LoadingState />
      </ClinicalPage>
    )
  }

  if (!order) {
    return (
      <ClinicalPage>
        <div className="text-center py-20 text-slate-400">Orden no encontrada.</div>
      </ClinicalPage>
    )
  }

  const orderCfg = ORDER_STATUS_CONFIG[order.status]
  const isCancelled = order.status === 'CANCELLED'
  const isCompleted = order.status === 'COMPLETED'

  // Group rows by panel
  const panels: Record<string, { rows: EditRow[]; indices: number[] }> = {}
  rows.forEach((r, i) => {
    if (!panels[r.panel_name]) panels[r.panel_name] = { rows: [], indices: [] }
    panels[r.panel_name].rows.push(r)
    panels[r.panel_name].indices.push(i)
  })

  return (
    <ClinicalPage size="compact">
      <ClinicalHeader
        eyebrow="Laboratorio"
        title={`${order.patient.first_name} ${order.patient.last_name}`}
        subtitle={`Orden del ${new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        icon={FlaskConical}
        meta={
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: orderCfg.color, background: orderCfg.bg }}
          >
            {orderCfg.label}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <ClinicalButton href="/lab" variant="outline" icon={ArrowLeft}>Volver</ClinicalButton>
            {!isCancelled && dirty && (
              <ClinicalButton
                onClick={saveResults}
                disabled={saving}
                icon={Save}
              >
                {saving ? 'Guardando…' : 'Guardar resultados'}
              </ClinicalButton>
            )}
          </div>
        }
      />

      {/* Order meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Paciente', value: `${order.patient.first_name} ${order.patient.last_name}` },
          { label: 'Médico', value: `Dr. ${order.doctor.first_name} ${order.doctor.last_name}` },
          { label: 'Estado', value: orderCfg.label },
          { label: 'Fecha', value: new Date(order.ordered_at).toLocaleDateString('es') },
        ].map(item => (
          <div key={item.label} className="rounded-xl bg-white border border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-400 mb-0.5">{item.label}</div>
            <div className="text-sm font-semibold text-slate-800">{item.value}</div>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <span className="font-medium">Notas: </span>{order.notes}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>
      )}

      {/* Results table by panel */}
      {order.results.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="py-12 text-center text-slate-400 text-sm">
            Esta orden no tiene parámetros definidos.
          </div>
        </div>
      ) : (
        Object.entries(panels).map(([panelName, panelData]) => (
          <div key={panelName} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">{panelName}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Parámetro</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Valor</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Unidad</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Referencia</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {panelData.rows.map((row, localIdx) => {
                    const globalIdx = panelData.indices[localIdx]
                    const localStatus = computeLocalStatus(row.value, row.ref_min, row.ref_max)
                    return (
                      <tr key={row.id} className={cn('border-b border-slate-100 last:border-0', isCancelled && 'opacity-50')}>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{row.parameter_name}</td>
                        <td className="px-4 py-2.5">
                          {isCancelled || isCompleted ? (
                            <span className={cn(
                              'font-semibold',
                              localStatus === 'CRITICAL_HIGH' || localStatus === 'CRITICAL_LOW' ? 'text-red-600' :
                              localStatus === 'HIGH' || localStatus === 'LOW' ? 'text-amber-600' :
                              localStatus === 'NORMAL' ? 'text-emerald-700' : 'text-slate-400',
                            )}>
                              {row.value || '—'}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={row.value}
                              onChange={e => handleValueChange(globalIdx, e.target.value)}
                              placeholder="—"
                              className={cn(
                                'w-24 h-8 px-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400',
                                row.value === '' ? 'border-slate-200' :
                                localStatus === 'CRITICAL_HIGH' || localStatus === 'CRITICAL_LOW' ? 'border-red-300 bg-red-50 text-red-700' :
                                localStatus === 'HIGH' || localStatus === 'LOW' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                                'border-emerald-300 bg-emerald-50 text-emerald-700',
                              )}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{row.unit || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {row.ref_text ? (
                            row.ref_text
                          ) : (row.ref_min != null || row.ref_max != null) ? (
                            `${row.ref_min ?? '?'} – ${row.ref_max ?? '?'}`
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.value !== '' ? (
                            <ResultStatusBadge status={localStatus} />
                          ) : (
                            <span className="text-xs text-slate-300">Pendiente</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Save floating bar */}
      {!isCancelled && dirty && (
        <div className="sticky bottom-4 flex justify-center pointer-events-none">
          <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-xl pointer-events-auto">
            <span className="text-sm">Hay cambios sin guardar.</span>
            <button
              onClick={saveResults}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors disabled:opacity-60"
            >
              <Save size={13} />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel order */}
      {!isCancelled && !isCompleted && (
        <div className="flex justify-end pt-2 border-t border-slate-100">
          {cancelOpen ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">¿Confirmas cancelar esta orden?</span>
              <button
                onClick={cancelOrder}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Sí, cancelar
              </button>
              <button
                onClick={() => setCancelOpen(false)}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCancelOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              <XCircle size={13} />
              Cancelar orden
            </button>
          )}
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          Orden completada. Todos los resultados fueron ingresados.
        </div>
      )}
    </ClinicalPage>
  )
}
