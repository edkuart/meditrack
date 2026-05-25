'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlaskConical, Upload, CheckCircle2, Clock, AlertTriangle,
  FileText, X, ChevronDown, ChevronUp, BrainCircuit, Printer,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import {
  getPortalLabOrders, getPatientExternalSubmissions, submitExternalLabResults,
  ORDER_STATUS_LABELS, SUBMISSION_STATUS_LABELS, RESULT_STATUS_CONFIG,
  type PatientLabOrder, type PatientExternalSubmission,
} from '@/lib/portal/lab-portal-api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('meditrack_patient_session')
    if (!raw) return null
    return (JSON.parse(raw) as { token: string }).token
  } catch { return null }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long' })
}

// ─── Upload form ──────────────────────────────────────────────────────────────

function UploadForm({ orderId, onSuccess, onCancel }: {
  orderId?: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [files, setFiles]         = useState<File[]>([])
  const [notes, setNotes]         = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [dropHov, setDropHov]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

  function addFiles(list: FileList | File[]) {
    const valid = Array.from(list).filter(f => ALLOWED.includes(f.type))
    setFiles(prev => [...prev, ...valid].slice(0, 5))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) { setError('Agrega al menos un archivo.'); return }
    const token = getToken()
    if (!token) { setError('Sesión expirada. Recarga la página.'); return }
    setUploading(true)
    setError('')
    try {
      await submitExternalLabResults(token, files, { order_id: orderId, patient_notes: notes || undefined })
      setDone(true)
      setTimeout(() => onSuccess(), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar. Intenta de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--mt-success-subtle)', color: 'var(--mt-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircle2 size={22} />
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--mt-text)' }}>¡Enviado con éxito!</p>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mt-text-2)' }}>Tu médico revisará los documentos pronto.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        onDrop={e => { e.preventDefault(); setDropHov(false); addFiles(e.dataTransfer.files) }}
        onDragOver={e => { e.preventDefault(); setDropHov(true) }}
        onDragLeave={() => setDropHov(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dropHov ? 'var(--mt-primary)' : 'var(--mt-border)'}`,
          borderRadius: 14, padding: '18px 16px', textAlign: 'center', cursor: 'pointer',
          background: dropHov ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <Upload size={20} style={{ margin: '0 auto 6px', color: dropHov ? 'var(--mt-primary)' : 'var(--mt-muted)', display: 'block' }} />
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)' }}>
          Toca para seleccionar archivos
        </p>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--mt-muted)' }}>
          PDF, foto o imagen — Máx. 20 MB, 5 archivos
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = '' } }}
        />
      </div>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 10,
              background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)',
            }}>
              <FileText size={13} style={{ color: 'var(--mt-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--mt-muted)', flexShrink: 0 }}>
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', padding: 2, flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        placeholder="Notas opcionales: nombre del laboratorio, fecha del examen…"
        style={{
          width: '100%', fontSize: 13.5, lineHeight: 1.5,
          border: '1px solid var(--mt-border)', borderRadius: 12,
          padding: '10px 12px', resize: 'none',
          fontFamily: 'var(--mt-font)', color: 'var(--mt-text)',
          background: 'var(--mt-surface)',
          boxSizing: 'border-box',
        }}
      />

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
          color: 'var(--mt-danger)', background: 'var(--mt-danger-subtle)',
          padding: '10px 12px', borderRadius: 10,
          border: '1px solid #FECACA',
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 14px', fontSize: 13.5, color: 'var(--mt-text-2)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mt-font)',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={uploading || files.length === 0}
          className="portal-confirm-btn"
          style={{ width: 'auto', minHeight: 40, padding: '0 20px', marginTop: 0, fontSize: 13.5 }}
        >
          {uploading ? (
            <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
          ) : (
            <><Upload size={14} /> Enviar resultados</>
          )}
        </button>
      </div>
    </form>
  )
}

// ─── Results panel ────────────────────────────────────────────────────────────

function ResultsPanel({ order }: { order: PatientLabOrder }) {
  const [open, setOpen] = useState(false)
  const [hov, setHov] = useState(false)

  const panels: Record<string, typeof order.results> = {}
  order.results.forEach(r => {
    if (!panels[r.panel_name]) panels[r.panel_name] = []
    panels[r.panel_name].push(r)
  })

  const criticalCount = order.results.filter(r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW').length
  const abnormalCount = order.results.filter(r => r.status === 'HIGH' || r.status === 'LOW').length

  return (
    <div style={{ borderTop: '1px solid var(--mt-border)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', border: 'none', cursor: 'pointer',
          background: hov ? 'var(--mt-elevated)' : 'transparent',
          transition: 'background .15s', fontFamily: 'var(--mt-font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)' }}>
            Ver resultados ({order.results.length} parámetros)
          </span>
          {criticalCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11.5, fontWeight: 700,
              color: 'var(--mt-danger)', background: 'var(--mt-danger-subtle)',
              padding: '2px 8px', borderRadius: 999,
            }}>
              <AlertTriangle size={10} /> {criticalCount} crítico{criticalCount > 1 ? 's' : ''}
            </span>
          )}
          {criticalCount === 0 && abnormalCount > 0 && (
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: '#B45309',
              background: '#FEF3C7', padding: '2px 8px', borderRadius: 999,
            }}>
              {abnormalCount} fuera de rango
            </span>
          )}
          {criticalCount === 0 && abnormalCount === 0 && (
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: 'var(--mt-success)',
              background: 'var(--mt-success-subtle)', padding: '2px 8px', borderRadius: 999,
            }}>
              Todo normal
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={15} color="var(--mt-muted)" />
          : <ChevronDown size={15} color="var(--mt-muted)" />}
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--mt-border)' }}>
          {Object.entries(panels).map(([panelName, results]) => (
            <div key={panelName}>
              <div style={{
                padding: '7px 16px',
                background: 'var(--mt-elevated)',
                borderBottom: '1px solid var(--mt-border)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mt-muted)' }}>
                  {panelName}
                </span>
              </div>
              {results.map((r, i) => {
                const cfg = RESULT_STATUS_CONFIG[r.status]
                const val = r.numeric_value ?? r.value
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12,
                    borderBottom: i < results.length - 1 ? '1px solid var(--mt-elevated)' : 'none',
                  }}>
                    <div style={{ flex: 1, fontSize: 13.5, color: 'var(--mt-text)' }}>{r.parameter_name}</div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: cfg.color }}>
                        {val ?? '—'}{r.unit ? ` ${r.unit}` : ''}
                      </span>
                      {r.ref_min && r.ref_max && (
                        <div style={{ fontSize: 11.5, color: 'var(--mt-muted)', marginTop: 2 }}>
                          Ref: {r.ref_min}–{r.ref_max}
                        </div>
                      )}
                    </div>
                    {r.status !== 'PENDING' && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, flexShrink: 0,
                        color: cfg.color, background: `${cfg.color}18`,
                      }}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onRefresh }: { order: PatientLabOrder; onRefresh: () => void }) {
  const [showUpload, setShowUpload] = useState(false)
  const [uploadHov, setUploadHov] = useState(false)
  const [printHov, setPrintHov] = useState(false)
  const statusCfg  = ORDER_STATUS_LABELS[order.status]
  const isPending  = order.status === 'PENDING' || order.status === 'IN_PROGRESS'
  const isComplete = order.status === 'COMPLETED'

  return (
    <div className="portal-plan-card">
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--mt-text)', letterSpacing: '-0.01em' }}>
              Dr. {order.doctor.first_name} {order.doctor.last_name}
              {order.doctor.specialty && (
                <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--mt-muted)' }}>
                  {order.doctor.specialty}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <span style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                color: statusCfg.color, background: `${statusCfg.color}15`,
              }}>
                {statusCfg.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{fmtDate(order.ordered_at)}</span>
            </div>
          </div>
        </div>
        {order.notes && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)', fontStyle: 'italic', lineHeight: 1.45 }}>
            {order.notes}
          </p>
        )}
      </div>

      {isComplete && order.results.length > 0 && (
        <>
          <ResultsPanel order={order} />
          <div style={{
            borderTop: '1px solid var(--mt-border)',
            padding: '8px 16px',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <Link
              href={`/portal/lab/${order.id}/print`}
              onMouseEnter={() => setPrintHov(true)}
              onMouseLeave={() => setPrintHov(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 600,
                color: printHov ? 'var(--mt-primary)' : 'var(--mt-muted)',
                textDecoration: 'none', transition: 'color .15s',
              }}
            >
              <Printer size={13} />
              Ver / Imprimir reporte
            </Link>
          </div>
        </>
      )}

      {isPending && !showUpload && (
        <div style={{
          borderTop: '1px solid var(--mt-border)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, color: 'var(--mt-muted)',
        }}>
          <Clock size={13} style={{ flexShrink: 0 }} />
          Los resultados estarán disponibles cuando el laboratorio los ingrese.
        </div>
      )}

      {isPending && (
        <div style={{ borderTop: '1px solid var(--mt-border)' }}>
          {showUpload ? (
            <div style={{ padding: '14px 16px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: 'var(--mt-text)' }}>
                Subir resultados de otro laboratorio
              </p>
              <UploadForm
                orderId={order.id}
                onSuccess={() => { setShowUpload(false); onRefresh() }}
                onCancel={() => setShowUpload(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowUpload(true)}
              onMouseEnter={() => setUploadHov(true)}
              onMouseLeave={() => setUploadHov(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                fontSize: 13.5, fontWeight: 600,
                color: 'var(--mt-primary)',
                background: uploadHov ? 'var(--mt-primary-subtle)' : 'transparent',
                transition: 'background .15s', fontFamily: 'var(--mt-font)',
              }}
            >
              <Upload size={14} />
              Tengo mis resultados de otro laboratorio
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Submission tracking card ─────────────────────────────────────────────────

function SubmissionCard({ submission }: { submission: PatientExternalSubmission }) {
  const cfg = SUBMISSION_STATUS_LABELS[submission.status]

  const iconColor = submission.status === 'VALIDATED'   ? 'var(--mt-success)'
                  : submission.status === 'REJECTED'    ? 'var(--mt-muted)'
                  : submission.status === 'DRAFT_READY' ? 'var(--mt-primary)'
                  : '#D97706'
  const iconBg    = submission.status === 'VALIDATED'   ? 'var(--mt-success-subtle)'
                  : submission.status === 'REJECTED'    ? 'var(--mt-elevated)'
                  : submission.status === 'DRAFT_READY' ? 'var(--mt-primary-subtle)'
                  : '#FEF3C7'
  const StatusIcon = submission.status === 'VALIDATED'   ? CheckCircle2
                   : submission.status === 'REJECTED'    ? AlertTriangle
                   : submission.status === 'DRAFT_READY' ? BrainCircuit
                   : Clock

  return (
    <div className="portal-plan-card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBg, color: iconColor,
        }}>
          <StatusIcon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--mt-text)' }}>{cfg.label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)' }}>{cfg.description}</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--mt-muted)', flexShrink: 0 }}>
          {fmtDate(submission.submitted_at)}
        </p>
      </div>
      {submission.files.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 48 }}>
          {submission.files.map(f => (
            <span key={f.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)',
              fontSize: 11.5, color: 'var(--mt-text-2)',
            }}>
              <FileText size={10} />
              {f.file_name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortalLabPage() {
  const [orders, setOrders]               = useState<PatientLabOrder[]>([])
  const [submissions, setSubmissions]     = useState<PatientExternalSubmission[]>([])
  const [loading, setLoading]             = useState(true)
  const [showFreeUpload, setShowFreeUpload] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    const [o, s] = await Promise.all([
      getPortalLabOrders(token),
      getPatientExternalSubmissions(token),
    ])
    setOrders(o)
    setSubmissions(s)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const pendingOrders   = orders.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS')
  const completedOrders = orders.filter(o => o.status === 'COMPLETED')
  const unlinkedSubs    = submissions.filter(s => !s.order_id)

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
      {/* Header */}
      <div style={{
        padding: '22px 18px 16px',
        borderBottom: '1px solid var(--mt-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <FlaskConical size={14} style={{ color: 'var(--mt-primary)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mt-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Laboratorio
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)', lineHeight: 1.15 }}>
          Mis exámenes
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
          Órdenes activas y resultados de laboratorio.
        </p>
      </div>

      <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '4px solid var(--mt-primary-mist)',
              borderTopColor: 'var(--mt-primary)',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        ) : (
          <>
            {pendingOrders.length > 0 && (
              <section>
                <h2 style={{
                  margin: '0 0 12px', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mt-muted)',
                }}>
                  Órdenes en curso
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pendingOrders.map(order => (
                    <OrderCard key={order.id} order={order} onRefresh={load} />
                  ))}
                </div>
              </section>
            )}

            {completedOrders.length > 0 && (
              <section>
                <h2 style={{
                  margin: '0 0 12px', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mt-muted)',
                }}>
                  Resultados
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {completedOrders.map(order => (
                    <OrderCard key={order.id} order={order} onRefresh={load} />
                  ))}
                </div>
              </section>
            )}

            {orders.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '48px 20px',
                background: 'var(--mt-elevated)', borderRadius: 16,
                border: '1px solid var(--mt-border)',
              }}>
                <FlaskConical size={28} style={{ margin: '0 auto 10px', color: 'var(--mt-muted)', display: 'block' }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--mt-text)' }}>
                  Sin exámenes aún
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--mt-muted)' }}>
                  Tu médico creará órdenes de laboratorio cuando las necesite.
                </p>
              </div>
            )}

            {unlinkedSubs.length > 0 && (
              <section>
                <h2 style={{
                  margin: '0 0 12px', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mt-muted)',
                }}>
                  Documentos enviados
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {unlinkedSubs.map(s => (
                    <SubmissionCard key={s.id} submission={s} />
                  ))}
                </div>
              </section>
            )}

            {/* CTA: upload without order */}
            <section>
              <div style={{
                borderRadius: 16, border: '1px solid var(--mt-primary-mist)',
                background: 'var(--mt-primary-subtle)', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(37,99,235,.12)', color: 'var(--mt-primary)',
                  }}>
                    <Upload size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: 'var(--mt-primary-deep)' }}>
                      ¿Tienes resultados de otro laboratorio?
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--mt-primary)' }}>
                      Envíalos directamente a tu médico para su revisión.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowFreeUpload(v => !v)}
                    style={{
                      flexShrink: 0, padding: '7px 14px', borderRadius: 10,
                      background: 'var(--mt-primary)', color: '#fff',
                      border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, fontFamily: 'var(--mt-font)',
                    }}
                  >
                    {showFreeUpload ? 'Cancelar' : 'Subir'}
                  </button>
                </div>
                {showFreeUpload && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--mt-primary-mist)' }}>
                    <UploadForm
                      onSuccess={() => { setShowFreeUpload(false); load() }}
                      onCancel={() => setShowFreeUpload(false)}
                    />
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
