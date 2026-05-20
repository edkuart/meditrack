'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlaskConical, Upload, CheckCircle2, Clock, AlertTriangle,
  FileText, X, ChevronDown, ChevronUp, BrainCircuit, Printer,
} from 'lucide-react'
import Link from 'next/link'
import {
  getPortalLabOrders, getPatientExternalSubmissions, submitExternalLabResults,
  ORDER_STATUS_LABELS, SUBMISSION_STATUS_LABELS, RESULT_STATUS_CONFIG,
  type PatientLabOrder, type PatientExternalSubmission,
} from '@/lib/portal/lab-portal-api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function UploadForm({
  orderId,
  onSuccess,
  onCancel,
}: {
  orderId?: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [files, setFiles]       = useState<File[]>([])
  const [notes, setNotes]       = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)
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
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={22} className="text-emerald-600" />
        </div>
        <p className="font-semibold text-slate-800">¡Enviado con éxito!</p>
        <p className="text-sm text-slate-500">Tu médico revisará los documentos pronto.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
      >
        <Upload size={20} className="mx-auto mb-1.5 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">Toca para seleccionar archivos</p>
        <p className="mt-0.5 text-xs text-slate-400">PDF, foto o imagen — Máx. 20 MB, 5 archivos</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = '' } }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
              <FileText size={13} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-700 truncate">{f.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 shrink-0">
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
        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 text-slate-700 placeholder:text-slate-300"
      />

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-lg border border-red-200">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={uploading || files.length === 0}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Upload size={13} />
          {uploading ? 'Enviando…' : 'Enviar resultados'}
        </button>
      </div>
    </form>
  )
}

// ─── Results panel (expandable) ───────────────────────────────────────────────

function ResultsPanel({ order }: { order: PatientLabOrder }) {
  const [open, setOpen] = useState(false)

  const panels: Record<string, typeof order.results> = {}
  order.results.forEach(r => {
    if (!panels[r.panel_name]) panels[r.panel_name] = []
    panels[r.panel_name].push(r)
  })

  const criticalCount = order.results.filter(
    r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW',
  ).length
  const abnormalCount = order.results.filter(
    r => r.status === 'HIGH' || r.status === 'LOW',
  ).length

  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-slate-700">
            Ver resultados ({order.results.length} parámetros)
          </span>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={10} /> {criticalCount} crítico{criticalCount > 1 ? 's' : ''}
            </span>
          )}
          {criticalCount === 0 && abnormalCount > 0 && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {abnormalCount} fuera de rango
            </span>
          )}
          {criticalCount === 0 && abnormalCount === 0 && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Todo normal
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {Object.entries(panels).map(([panelName, results]) => (
            <div key={panelName}>
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{panelName}</span>
              </div>
              {results.map((r, i) => {
                const cfg = RESULT_STATUS_CONFIG[r.status]
                const val = r.numeric_value ?? r.value
                return (
                  <div key={i} className="flex items-center px-5 py-3 gap-3 border-b border-slate-50 last:border-0">
                    <div className="flex-1 text-sm text-slate-700">{r.parameter_name}</div>
                    <div className="text-right">
                      <span className="text-sm font-semibold" style={{ color: cfg.color }}>
                        {val ?? '—'}{r.unit ? ` ${r.unit}` : ''}
                      </span>
                      {r.ref_min && r.ref_max && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Ref: {r.ref_min}–{r.ref_max}
                        </div>
                      )}
                    </div>
                    {r.status !== 'PENDING' && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ color: cfg.color, background: `${cfg.color}18` }}
                      >
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
  const statusCfg  = ORDER_STATUS_LABELS[order.status]
  const isPending  = order.status === 'PENDING' || order.status === 'IN_PROGRESS'
  const isComplete = order.status === 'COMPLETED'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Dr. {order.doctor.first_name} {order.doctor.last_name}
              {order.doctor.specialty && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">{order.doctor.specialty}</span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ color: statusCfg.color, background: `${statusCfg.color}15` }}
              >
                {statusCfg.label}
              </span>
              <span className="text-xs text-slate-400">{fmtDate(order.ordered_at)}</span>
            </div>
          </div>
        </div>
        {order.notes && (
          <p className="mt-2 text-xs text-slate-500 italic leading-relaxed">{order.notes}</p>
        )}
      </div>

      {/* Completed → show expandable results + print link */}
      {isComplete && order.results.length > 0 && (
        <>
          <ResultsPanel order={order} />
          <div className="border-t border-slate-100 px-5 py-2.5 flex justify-end">
            <Link
              href={`/portal/lab/${order.id}/print`}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
            >
              <Printer size={12} />
              Ver / Imprimir reporte
            </Link>
          </div>
        </>
      )}

      {/* Pending → waiting message */}
      {isPending && !showUpload && (
        <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-2 text-xs text-slate-400">
          <Clock size={12} className="shrink-0" />
          Los resultados estarán disponibles cuando el laboratorio los ingrese.
        </div>
      )}

      {/* Upload external results (only pending orders) */}
      {isPending && (
        <div className="border-t border-slate-100">
          {showUpload ? (
            <div className="px-5 py-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">
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
              className="w-full flex items-center gap-2 px-5 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
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

  const statusIcon = submission.status === 'VALIDATED'  ? <CheckCircle2 size={14} className="text-emerald-600" />
                   : submission.status === 'REJECTED'   ? <AlertTriangle size={14} className="text-slate-400" />
                   : submission.status === 'DRAFT_READY' ? <BrainCircuit size={14} className="text-blue-500" />
                   : <Clock size={14} className="text-amber-500" />

  const iconBg = submission.status === 'VALIDATED'  ? 'bg-emerald-50'
               : submission.status === 'REJECTED'   ? 'bg-slate-100'
               : submission.status === 'DRAFT_READY' ? 'bg-blue-50'
               : 'bg-amber-50'

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {statusIcon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{cfg.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{cfg.description}</p>
        </div>
        <p className="text-xs text-slate-400 shrink-0">{fmtDate(submission.submitted_at)}</p>
      </div>
      {submission.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
          {submission.files.map(f => (
            <span key={f.id} className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-500">
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
  const [orders, setOrders]         = useState<PatientLabOrder[]>([])
  const [submissions, setSubmissions] = useState<PatientExternalSubmission[]>([])
  const [loading, setLoading]       = useState(true)
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
  // Submissions not linked to any order (standalone upload)
  const unlinkedSubs    = submissions.filter(s => !s.order_id)

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={14} className="text-blue-600" />
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Laboratorio</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Mis exámenes</h1>
        <p className="text-sm text-slate-400 mt-0.5">Órdenes activas y resultados de laboratorio.</p>
      </div>

      <div className="px-4 pt-5 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Órdenes pendientes ── */}
            {pendingOrders.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Órdenes en curso
                </h2>
                <div className="space-y-3">
                  {pendingOrders.map(order => (
                    <OrderCard key={order.id} order={order} onRefresh={load} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Resultados completados ── */}
            {completedOrders.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Resultados
                </h2>
                <div className="space-y-3">
                  {completedOrders.map(order => (
                    <OrderCard key={order.id} order={order} onRefresh={load} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Empty state ── */}
            {orders.length === 0 && (
              <div className="text-center py-12 px-4 bg-slate-50 rounded-2xl border border-slate-200">
                <FlaskConical size={28} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Sin exámenes aún</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tu médico creará órdenes de laboratorio cuando las necesite.
                </p>
              </div>
            )}

            {/* ── Envíos sin orden vinculada ── */}
            {unlinkedSubs.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Documentos enviados
                </h2>
                <div className="space-y-2">
                  {unlinkedSubs.map(s => (
                    <SubmissionCard key={s.id} submission={s} />
                  ))}
                </div>
              </section>
            )}

            {/* ── CTA: subir sin orden ── */}
            <section>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Upload size={16} className="text-blue-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-900">
                      ¿Tienes resultados de otro laboratorio?
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      Envíalos directamente a tu médico para su revisión.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowFreeUpload(v => !v)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
                  >
                    {showFreeUpload ? 'Cancelar' : 'Subir'}
                  </button>
                </div>
                {showFreeUpload && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
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
