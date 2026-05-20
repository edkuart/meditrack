'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, BrainCircuit, CheckCircle2, XCircle, Edit3, FileText,
  ExternalLink, AlertTriangle, Loader2, Check, Trash2,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getExternalSubmission, triggerAiExtraction, updateExtractedValue, validateSubmission,
  SUBMISSION_STATUS_CONFIG, CONFIDENCE_CONFIG,
  type ExternalSubmission, type ExtractedValue,
} from '@/lib/doctor/lab-external-api'
import { ClinicalPage, ClinicalHeader, ClinicalButton, LoadingState } from '@/components/doctor/clinical-ui'
import { cn } from '@/lib/utils'

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const num = parseFloat(confidence)
  const cfg = CONFIDENCE_CONFIG(num)
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

// ─── AI flag badge ────────────────────────────────────────────────────────────

function AiFlagBadge({ flag }: { flag: string | null }) {
  if (!flag) return null
  const config = {
    H: { label: 'Alto ↑',   color: '#d97706', bg: '#fffbeb' },
    L: { label: 'Bajo ↓',   color: '#2563eb', bg: '#eff6ff' },
    N: { label: 'Normal',   color: '#059669', bg: '#ecfdf5' },
  }[flag]
  if (!config) return null
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: config.color, background: config.bg }}>
      {config.label}
    </span>
  )
}

// ─── Value row ────────────────────────────────────────────────────────────────

function ValueRow({
  value,
  onAccept,
  onReject,
  onEdit,
}: {
  value: ExtractedValue
  onAccept: () => void
  onReject: () => void
  onEdit: (newVal: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value.doctor_value ?? value.raw_value ?? '')
  const confidence = parseFloat(value.confidence)
  const isLowConfidence = confidence < 0.7
  const isAccepted = value.status === 'ACCEPTED' || value.status === 'EDITED'
  const isRejected = value.status === 'REJECTED'

  return (
    <tr className={cn(
      'border-b border-slate-100 last:border-0 transition-colors',
      isLowConfidence && value.status === 'AI_DRAFT' && 'bg-amber-50/40',
      isAccepted && 'bg-emerald-50/30',
      isRejected && 'opacity-40',
    )}>
      <td className="px-4 py-2.5">
        <div className="text-sm font-medium text-slate-700">{value.parameter_name}</div>
        {value.raw_text && (
          <div className="text-xs text-slate-400 font-mono truncate max-w-[180px]" title={value.raw_text}>
            {value.raw_text}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              className="w-24 h-7 px-2 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
            <button
              onClick={() => { onEdit(editVal); setEditing(false) }}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
            >
              <XCircle size={13} />
            </button>
          </div>
        ) : (
          <span className={cn(
            'font-semibold text-sm',
            isAccepted ? 'text-emerald-700' : isRejected ? 'text-slate-300' : 'text-slate-700',
          )}>
            {value.doctor_value ?? value.raw_value ?? '—'}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400">{value.unit || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-slate-400">
        {value.ref_text ?? (value.ref_min || value.ref_max
          ? `${value.ref_min ?? '?'} – ${value.ref_max ?? '?'}`
          : '—')}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <AiFlagBadge flag={value.ai_flag} />
          <ConfidenceBadge confidence={value.confidence} />
        </div>
      </td>
      <td className="px-4 py-2.5">
        {value.status === 'AI_DRAFT' ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onAccept}
              title="Aceptar"
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              <Check size={11} /> Aceptar
            </button>
            <button
              onClick={() => setEditing(true)}
              title="Editar valor"
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={onReject}
              title="Rechazar"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : isAccepted ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={12} />
            {value.status === 'EDITED' ? 'Editado' : 'Aceptado'}
          </span>
        ) : (
          <span className="text-xs text-slate-300">Rechazado</span>
        )}
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExternalSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()

  const [submission, setSubmission] = useState<ExternalSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !id) return
    getExternalSubmission(token, id)
      .then(setSubmission)
      .finally(() => setLoading(false))
  }, [token, id])

  const handleExtract = useCallback(async () => {
    if (!token || !submission) return
    setExtracting(true)
    setError('')
    try {
      const updated = await triggerAiExtraction(token, submission.id)
      setSubmission(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar.')
    } finally {
      setExtracting(false)
    }
  }, [token, submission])

  const handleValueAction = useCallback(async (
    valueId: string,
    status: 'ACCEPTED' | 'EDITED' | 'REJECTED',
    doctorValue?: string,
  ) => {
    if (!token || !submission) return
    try {
      const updated = await updateExtractedValue(token, submission.id, valueId, { status, doctor_value: doctorValue })
      setSubmission(updated)
    } catch {
      // silent
    }
  }, [token, submission])

  const handleAcceptAll = useCallback(async () => {
    if (!token || !submission) return
    const drafts = submission.extracted_values.filter(v => v.status === 'AI_DRAFT')
    for (const v of drafts) {
      await handleValueAction(v.id, 'ACCEPTED')
    }
  }, [token, submission, handleValueAction])

  const handleValidate = useCallback(async () => {
    if (!token || !submission) return
    setValidating(true)
    setError('')
    try {
      const updated = await validateSubmission(token, submission.id)
      setSubmission(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar.')
    } finally {
      setValidating(false)
    }
  }, [token, submission])

  if (loading) return <ClinicalPage><LoadingState /></ClinicalPage>
  if (!submission) return (
    <ClinicalPage>
      <div className="text-center py-20 text-slate-400">Submission no encontrado.</div>
    </ClinicalPage>
  )

  const statusCfg = SUBMISSION_STATUS_CONFIG[submission.status]
  const acceptedCount = submission.extracted_values.filter(v => v.status === 'ACCEPTED' || v.status === 'EDITED').length
  const draftCount    = submission.extracted_values.filter(v => v.status === 'AI_DRAFT').length
  const canExtract    = submission.status === 'RECEIVED' || submission.status === 'DRAFT_READY'
  const canValidate   = submission.status === 'DRAFT_READY' && acceptedCount > 0
  const isValidated   = submission.status === 'VALIDATED'

  // Group values by panel
  const panels: Record<string, ExtractedValue[]> = {}
  submission.extracted_values.forEach(v => {
    if (!panels[v.panel_name]) panels[v.panel_name] = []
    panels[v.panel_name].push(v)
  })

  return (
    <ClinicalPage size="compact">
      <ClinicalHeader
        eyebrow="Laboratorio / Externos"
        title={`${submission.patient.first_name} ${submission.patient.last_name}`}
        subtitle={`Enviado el ${new Date(submission.submitted_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        icon={FileText}
        meta={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: statusCfg.color, background: statusCfg.bg }}>
            {statusCfg.label}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <ClinicalButton href="/lab/external" variant="outline" icon={ArrowLeft}>Volver</ClinicalButton>
            {canExtract && (
              <ClinicalButton
                onClick={handleExtract}
                disabled={extracting}
                icon={extracting ? Loader2 : BrainCircuit}
              >
                {extracting ? 'Analizando…' : 'Analizar con IA'}
              </ClinicalButton>
            )}
            {canValidate && (
              <ClinicalButton
                onClick={handleValidate}
                disabled={validating}
                icon={CheckCircle2}
              >
                {validating ? 'Validando…' : `Validar (${acceptedCount})`}
              </ClinicalButton>
            )}
          </div>
        }
      />

      {/* Metadata row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Paciente',   value: `${submission.patient.first_name} ${submission.patient.last_name}` },
          { label: 'Archivos',   value: `${submission.files.length} documento${submission.files.length !== 1 ? 's' : ''}` },
          { label: 'Estado',     value: statusCfg.label },
          { label: 'Enviado',    value: new Date(submission.submitted_at).toLocaleDateString('es') },
        ].map(item => (
          <div key={item.label} className="rounded-xl bg-white border border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-400 mb-0.5">{item.label}</div>
            <div className="text-sm font-semibold text-slate-800">{item.value}</div>
          </div>
        ))}
      </div>

      {submission.patient_notes && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <span className="font-medium">Nota del paciente: </span>{submission.patient_notes}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Uploaded files */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Documentos enviados</h3>
          <span className="text-xs text-slate-400">{submission.files.length} archivo{submission.files.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {submission.files.map(file => (
            <div key={file.id} className="flex items-center gap-3 px-5 py-3">
              <FileText size={16} className="text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{file.file_name}</div>
                <div className="text-xs text-slate-400">{file.mime_type}</div>
              </div>
              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ver <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
          {submission.files.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-slate-400">Sin archivos adjuntos.</div>
          )}
        </div>
      </div>

      {/* AI extracted values */}
      {submission.extracted_values.length > 0 ? (
        <div className="space-y-4">
          {/* Accept-all shortcut */}
          {draftCount > 0 && !isValidated && (
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <BrainCircuit size={15} />
                <span>
                  <span className="font-semibold">{draftCount} valores</span> pendientes de revisión.
                  {acceptedCount > 0 && ` ${acceptedCount} aceptados.`}
                </span>
              </div>
              <button
                onClick={handleAcceptAll}
                className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Aceptar todos
              </button>
            </div>
          )}

          {Object.entries(panels).map(([panelName, values]) => (
            <div key={panelName} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">{panelName}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Parámetro', 'Valor', 'Unidad', 'Referencia', 'IA', 'Acción'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {values.map(value => (
                      <ValueRow
                        key={value.id}
                        value={value}
                        onAccept={() => handleValueAction(value.id, 'ACCEPTED')}
                        onReject={() => handleValueAction(value.id, 'REJECTED')}
                        onEdit={(v) => handleValueAction(value.id, 'EDITED', v)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <BrainCircuit size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Sin valores extraídos</p>
          <p className="mt-1 text-xs text-slate-400 mb-4">
            Presiona "Analizar con IA" para que el sistema extraiga los resultados automáticamente.
          </p>
          {canExtract && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {extracting ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
              {extracting ? 'Analizando…' : 'Analizar con IA'}
            </button>
          )}
        </div>
      )}

      {isValidated && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          Resultados validados y fusionados con la orden de laboratorio.
        </div>
      )}
    </ClinicalPage>
  )
}
