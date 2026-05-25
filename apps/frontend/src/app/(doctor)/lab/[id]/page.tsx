'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  FlaskConical, ArrowLeft, Save, CheckCircle2, XCircle, Clock,
  Upload, BrainCircuit, ChevronRight, Printer,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getLabOrder, updateLabOrder, upsertLabResults,
  STATUS_CONFIG, ORDER_STATUS_CONFIG,
  type LabOrder, type LabOrderStatus, type LabResult, type LabResultInput,
} from '@/lib/doctor/lab-api'
import {
  listExternalSubmissions, SUBMISSION_STATUS_CONFIG,
  type ExternalSubmission,
} from '@/lib/doctor/lab-external-api'
import { ClinicalPage, ClinicalHeader, ClinicalButton, LoadingState } from '@/components/doctor/clinical-ui'
import Link from 'next/link'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'

// ─── Status badge ─────────────────────────────────────────────────────────────

function ResultStatusBadge({ status }: { status: LabResult['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
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

function valueInputStyle(localStatus: LabResult['status'], isEmpty: boolean): React.CSSProperties {
  if (isEmpty) return { width: 96, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid var(--mt-border)', borderRadius: 6, outline: 'none', background: 'var(--mt-surface)', color: 'var(--mt-text)' }
  if (localStatus === 'CRITICAL_HIGH' || localStatus === 'CRITICAL_LOW') return { width: 96, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #fca5a5', borderRadius: 6, outline: 'none', background: '#FFF5F5', color: 'var(--mt-danger)' }
  if (localStatus === 'HIGH' || localStatus === 'LOW') return { width: 96, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #FCD34D', borderRadius: 6, outline: 'none', background: '#FFFBEB', color: '#92400E' }
  return { width: 96, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #6EE7B7', borderRadius: 6, outline: 'none', background: 'var(--mt-success-subtle)', color: '#065F46' }
}

function valueTextColor(localStatus: LabResult['status']): string {
  if (localStatus === 'CRITICAL_HIGH' || localStatus === 'CRITICAL_LOW') return 'var(--mt-danger)'
  if (localStatus === 'HIGH' || localStatus === 'LOW') return '#D97706'
  if (localStatus === 'NORMAL') return 'var(--mt-success)'
  return 'var(--mt-muted)'
}

// ─── Info banner ─────────────────────────────────────────────────────────────

function InfoBanner({ icon: Icon, children, variant = 'info' }: { icon: typeof FlaskConical; children: React.ReactNode; variant?: 'info' | 'neutral' | 'success' | 'error' }) {
  const styles = {
    info:    { bg: 'var(--mt-primary-subtle)', border: 'var(--mt-primary-mist)', color: 'var(--mt-primary-deep)' },
    neutral: { bg: 'var(--mt-elevated)', border: 'var(--mt-border)', color: 'var(--mt-text-2)' },
    success: { bg: 'var(--mt-success-subtle)', border: '#6EE7B7', color: '#065F46' },
    error:   { bg: 'var(--mt-danger-subtle)', border: '#fecaca', color: 'var(--mt-danger)' },
  }[variant]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `1px solid ${styles.border}`, background: styles.bg, fontSize: 13, color: styles.color }}>
      <Icon size={16} style={{ flexShrink: 0 }} />
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LabOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token, user } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<LabOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<EditRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [externalSubs, setExternalSubs] = useState<ExternalSubmission[]>([])

  const canEditResults = hasPermission(user?.role, PERMISSIONS.LAB_RESULT_WRITE, user?.permissions)
  const canCancelOrder = hasPermission(user?.role, PERMISSIONS.LAB_ORDER_WRITE, user?.permissions)
  const isLabTech = user?.role === 'LAB_TECHNICIAN' || (canEditResults && !canCancelOrder)

  useEffect(() => {
    if (!token || !id) return
    Promise.all([
      getLabOrder(token, id),
      listExternalSubmissions(token, undefined, id),
    ]).then(([o, subs]) => {
      setOrder(o)
      setRows(buildEditRows(o.results))
      setExternalSubs(subs)
    }).finally(() => setLoading(false))
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
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--mt-muted)', fontSize: 13 }}>Orden no encontrada.</div>
      </ClinicalPage>
    )
  }

  const orderCfg = ORDER_STATUS_CONFIG[order.status]
  const isCancelled = order.status === 'CANCELLED'
  const isCompleted = order.status === 'COMPLETED'
  const isInProgress = order.status === 'IN_PROGRESS'
  const editingEnabled = canEditResults && !isCancelled && !isCompleted

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
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: orderCfg.color, background: orderCfg.bg }}>
            {orderCfg.label}
          </span>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <ClinicalButton href="/lab" variant="outline" icon={ArrowLeft}>Volver</ClinicalButton>
            {isCompleted && (
              <ClinicalButton href={`/lab/${id}/print`} variant="outline" icon={Printer}>
                Imprimir
              </ClinicalButton>
            )}
            {editingEnabled && dirty && (
              <ClinicalButton onClick={saveResults} disabled={saving} icon={Save}>
                {saving ? 'Guardando…' : 'Guardar resultados'}
              </ClinicalButton>
            )}
          </div>
        }
      />

      {/* Order meta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { label: 'Paciente', value: `${order.patient.first_name} ${order.patient.last_name}` },
          { label: 'Médico', value: `Dr. ${order.doctor.first_name} ${order.doctor.last_name}` },
          { label: 'Estado', value: orderCfg.label },
          { label: 'Fecha', value: new Date(order.ordered_at).toLocaleDateString('es') },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 12, background: 'var(--mt-surface)', border: '1px solid var(--mt-border)', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {order.notes && (
        <InfoBanner icon={FlaskConical} variant="info">
          <span><span style={{ fontWeight: 500 }}>Notas: </span>{order.notes}</span>
        </InfoBanner>
      )}

      {/* External submissions from patient */}
      {externalSubs.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid #FDE68A', background: '#FFFBEB', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #FDE68A' }}>
            <Upload size={14} color="#D97706" />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Resultados enviados por el paciente
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#D97706', fontWeight: 500 }}>
              {externalSubs.length} envío{externalSubs.length > 1 ? 's' : ''}
            </span>
          </div>
          {externalSubs.map((sub, i) => {
            const cfg = SUBMISSION_STATUS_CONFIG[sub.status]
            const isPending = sub.status === 'RECEIVED' || sub.status === 'DRAFT_READY'
            return (
              <ExternalSubRow key={sub.id} sub={sub} cfg={cfg} isPending={isPending} isLast={i === externalSubs.length - 1} />
            )
          })}
        </div>
      )}

      {/* Status banners */}
      {isInProgress && !isLabTech && (
        <InfoBanner icon={FlaskConical} variant="info">
          El laboratorio está procesando esta orden. Los resultados estarán disponibles pronto.
        </InfoBanner>
      )}
      {isInProgress && isLabTech && (
        <InfoBanner icon={Clock} variant="info">
          Orden en proceso. Ingresa los valores y guarda para actualizar el estado.
        </InfoBanner>
      )}
      {!canEditResults && !isCancelled && !isCompleted && (
        <InfoBanner icon={FlaskConical} variant="neutral">
          Los resultados son ingresados por el personal de laboratorio. Esta vista es de solo lectura.
        </InfoBanner>
      )}

      {error && (
        <InfoBanner icon={FlaskConical} variant="error">{error}</InfoBanner>
      )}

      {/* Results table by panel */}
      {order.results.length === 0 ? (
        <div style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)' }}>
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--mt-muted)', fontSize: 13 }}>
            Esta orden no tiene parámetros definidos.
          </div>
        </div>
      ) : (
        Object.entries(panels).map(([panelName, panelData]) => (
          <div key={panelName} style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: 'var(--mt-elevated)', borderBottom: '1px solid var(--mt-border)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>{panelName}</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mt-border)' }}>
                    {['Parámetro', 'Valor', 'Unidad', 'Referencia', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mt-muted)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {panelData.rows.map((row, localIdx) => {
                    const globalIdx = panelData.indices[localIdx]
                    const localStatus = computeLocalStatus(row.value, row.ref_min, row.ref_max)
                    const isLast = localIdx === panelData.rows.length - 1
                    return (
                      <tr key={row.id} style={{ borderBottom: !isLast ? '1px solid var(--mt-border)' : 'none', opacity: isCancelled ? 0.5 : 1 }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--mt-text-2)' }}>{row.parameter_name}</td>
                        <td style={{ padding: '10px 16px' }}>
                          {editingEnabled ? (
                            <input
                              type="text"
                              value={row.value}
                              onChange={e => handleValueChange(globalIdx, e.target.value)}
                              placeholder="—"
                              style={valueInputStyle(localStatus, row.value === '')}
                            />
                          ) : (
                            <span style={{ fontWeight: 600, color: valueTextColor(localStatus) }}>
                              {row.value || '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)' }}>{row.unit || '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)' }}>
                          {row.ref_text ? row.ref_text : (row.ref_min != null || row.ref_max != null) ? `${row.ref_min ?? '?'} – ${row.ref_max ?? '?'}` : '—'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {row.value !== '' ? (
                            <ResultStatusBadge status={localStatus} />
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--mt-muted)', opacity: 0.5 }}>Pendiente</span>
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

      {/* Floating save bar */}
      {editingEnabled && dirty && (
        <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--mt-text)', color: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,.25)', pointerEvents: 'auto' }}>
            <span style={{ fontSize: 13 }}>Hay cambios sin guardar.</span>
            <FloatSaveBtn saving={saving} onSave={saveResults} />
          </div>
        </div>
      )}

      {/* Cancel order */}
      {canCancelOrder && !isCancelled && !isCompleted && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--mt-border)' }}>
          {cancelOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--mt-muted)' }}>¿Confirmas cancelar esta orden?</span>
              <button
                onClick={cancelOrder}
                disabled={saving}
                style={{ padding: '6px 12px', fontSize: 13, fontWeight: 500, color: '#fff', background: 'var(--mt-danger)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                Sí, cancelar
              </button>
              <button
                onClick={() => setCancelOpen(false)}
                style={{ padding: '6px 12px', fontSize: 13, color: 'var(--mt-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                No
              </button>
            </div>
          ) : (
            <CancelTriggerBtn onClick={() => setCancelOpen(true)} />
          )}
        </div>
      )}

      {isCompleted && (
        <InfoBanner icon={CheckCircle2} variant="success">
          Orden completada. Todos los resultados fueron ingresados.
        </InfoBanner>
      )}
    </ClinicalPage>
  )
}

function FloatSaveBtn({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onSave}
      disabled={saving}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', fontSize: 13, fontWeight: 600,
        background: hov ? 'var(--mt-primary)' : 'rgba(37,99,235,.85)', color: '#fff',
        border: 'none', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
      }}
    >
      <Save size={13} />
      {saving ? 'Guardando…' : 'Guardar'}
    </button>
  )
}

function CancelTriggerBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: hov ? 'var(--mt-danger)' : 'var(--mt-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <XCircle size={13} />
      Cancelar orden
    </button>
  )
}

function ExternalSubRow({ sub, cfg, isPending, isLast }: { sub: ExternalSubmission; cfg: { color: string; bg: string; label: string }; isPending: boolean; isLast: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <Link
      href={`/lab/external/${sub.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', textDecoration: 'none',
        borderBottom: !isLast ? '1px solid #FEF3C7' : 'none',
        background: hov ? '#FEF3C7' : 'transparent', transition: 'background .1s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
            {new Date(sub.submitted_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {(sub.file_count ?? 0) > 0 && <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>· {sub.file_count} archivo{(sub.file_count ?? 0) > 1 ? 's' : ''}</span>}
          {(sub.extracted_count ?? 0) > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mt-purple-deep)', fontWeight: 500 }}>
              <BrainCircuit size={11} />
              {sub.extracted_count} valores extraídos
            </span>
          )}
        </div>
        {sub.patient_notes && (
          <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.patient_notes}</p>
        )}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 8,
        background: isPending ? '#D97706' : 'transparent',
        color: isPending ? '#fff' : 'var(--mt-muted)',
      }}>
        {isPending ? 'Revisar' : 'Ver'}
      </span>
      <ChevronRight size={14} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
    </Link>
  )
}
