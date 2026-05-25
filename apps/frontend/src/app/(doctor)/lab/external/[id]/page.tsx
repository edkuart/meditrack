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

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const num = parseFloat(confidence)
  const cfg = CONFIDENCE_CONFIG(num)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ─── AI flag badge ────────────────────────────────────────────────────────────

function AiFlagBadge({ flag }: { flag: string | null }) {
  if (!flag) return null
  const config: Record<string, { label: string; color: string; bg: string }> = {
    H: { label: 'Alto ↑',  color: '#d97706', bg: '#fffbeb' },
    L: { label: 'Bajo ↓',  color: '#2563eb', bg: '#eff6ff' },
    N: { label: 'Normal',  color: '#059669', bg: '#ecfdf5' },
  }
  const c = config[flag]
  if (!c) return null
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, color: c.color, background: c.bg }}>
      {c.label}
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

  const rowBg = isLowConfidence && value.status === 'AI_DRAFT' ? 'rgba(251,191,36,.06)' : isAccepted ? 'rgba(16,185,129,.04)' : 'transparent'

  return (
    <tr style={{ borderBottom: '1px solid var(--mt-border)', background: rowBg, opacity: isRejected ? 0.4 : 1 }}>
      <td style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)' }}>{value.parameter_name}</div>
        {value.raw_text && (
          <div style={{ fontSize: 11, color: 'var(--mt-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }} title={value.raw_text}>
            {value.raw_text}
          </div>
        )}
      </td>
      <td style={{ padding: '10px 16px' }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              style={{ width: 96, height: 28, padding: '0 8px', fontSize: 13, border: '1px solid var(--mt-primary-mist)', borderRadius: 6, outline: 'none' }}
              autoFocus
            />
            <IconBtn icon={Check} onClick={() => { onEdit(editVal); setEditing(false) }} hoverColor="var(--mt-success)" />
            <IconBtn icon={XCircle} onClick={() => setEditing(false)} hoverColor="var(--mt-muted)" />
          </div>
        ) : (
          <span style={{ fontWeight: 600, fontSize: 13, color: isAccepted ? 'var(--mt-success)' : isRejected ? 'var(--mt-muted)' : 'var(--mt-text-2)' }}>
            {value.doctor_value ?? value.raw_value ?? '—'}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)' }}>{value.unit || '—'}</td>
      <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--mt-muted)' }}>
        {value.ref_text ?? (value.ref_min || value.ref_max ? `${value.ref_min ?? '?'} – ${value.ref_max ?? '?'}` : '—')}
      </td>
      <td style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <AiFlagBadge flag={value.ai_flag} />
          <ConfidenceBadge confidence={value.confidence} />
        </div>
      </td>
      <td style={{ padding: '10px 16px' }}>
        {value.status === 'AI_DRAFT' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AcceptBtn onClick={onAccept} />
            <IconBtn icon={Edit3} onClick={() => setEditing(true)} hoverColor="var(--mt-primary)" />
            <IconBtn icon={Trash2} onClick={onReject} hoverColor="var(--mt-danger)" />
          </div>
        ) : isAccepted ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mt-success)', fontWeight: 500 }}>
            <CheckCircle2 size={12} />
            {value.status === 'EDITED' ? 'Editado' : 'Aceptado'}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--mt-muted)', opacity: 0.5 }}>Rechazado</span>
        )}
      </td>
    </tr>
  )
}

function AcceptBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 500, border: 'none', borderRadius: 8, cursor: 'pointer', background: hov ? 'var(--mt-success-subtle)' : 'var(--mt-elevated)', color: 'var(--mt-success)' }}
    >
      <Check size={11} /> Aceptar
    </button>
  )
}

function IconBtn({ icon: Icon, onClick, hoverColor }: { icon: typeof Check; onClick: () => void; hoverColor: string }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ padding: 6, border: 'none', borderRadius: 8, cursor: 'pointer', background: hov ? 'var(--mt-elevated)' : 'transparent', color: hov ? hoverColor : 'var(--mt-muted)' }}
    >
      <Icon size={12} />
    </button>
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
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--mt-muted)', fontSize: 13 }}>Submission no encontrado.</div>
    </ClinicalPage>
  )

  const statusCfg = SUBMISSION_STATUS_CONFIG[submission.status]
  const acceptedCount = submission.extracted_values.filter(v => v.status === 'ACCEPTED' || v.status === 'EDITED').length
  const draftCount    = submission.extracted_values.filter(v => v.status === 'AI_DRAFT').length
  const canExtract    = submission.status === 'RECEIVED' || submission.status === 'DRAFT_READY'
  const canValidate   = submission.status === 'DRAFT_READY' && acceptedCount > 0
  const isValidated   = submission.status === 'VALIDATED'

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
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: statusCfg.color, background: statusCfg.bg }}>
            {statusCfg.label}
          </span>
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <ClinicalButton href="/lab/external" variant="outline" icon={ArrowLeft}>Volver</ClinicalButton>
            {canExtract && (
              <ClinicalButton onClick={handleExtract} disabled={extracting} icon={extracting ? Loader2 : BrainCircuit}>
                {extracting ? 'Analizando…' : 'Analizar con IA'}
              </ClinicalButton>
            )}
            {canValidate && (
              <ClinicalButton onClick={handleValidate} disabled={validating} icon={CheckCircle2}>
                {validating ? 'Validando…' : `Validar (${acceptedCount})`}
              </ClinicalButton>
            )}
          </div>
        }
      />

      {/* Metadata row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { label: 'Paciente',   value: `${submission.patient.first_name} ${submission.patient.last_name}` },
          { label: 'Archivos',   value: `${submission.files.length} documento${submission.files.length !== 1 ? 's' : ''}` },
          { label: 'Estado',     value: statusCfg.label },
          { label: 'Enviado',    value: new Date(submission.submitted_at).toLocaleDateString('es') },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 12, background: 'var(--mt-surface)', border: '1px solid var(--mt-border)', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {submission.patient_notes && (
        <div style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--mt-primary-mist)', background: 'var(--mt-primary-subtle)', fontSize: 13, color: 'var(--mt-primary-deep)' }}>
          <span style={{ fontWeight: 500 }}>Nota del paciente: </span>{submission.patient_notes}
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: '1px solid #fecaca', background: 'var(--mt-danger-subtle)', fontSize: 13, color: 'var(--mt-danger)' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Uploaded files */}
      <div style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: 'var(--mt-elevated)', borderBottom: '1px solid var(--mt-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>Documentos enviados</h3>
          <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>{submission.files.length} archivo{submission.files.length !== 1 ? 's' : ''}</span>
        </div>
        <div>
          {submission.files.map((file, i) => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < submission.files.length - 1 ? '1px solid var(--mt-border)' : 'none' }}>
              <FileText size={16} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</div>
                <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>{file.mime_type}</div>
              </div>
              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mt-primary)', fontWeight: 500, textDecoration: 'none' }}
                >
                  Ver <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
          {submission.files.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>Sin archivos adjuntos.</div>
          )}
        </div>
      </div>

      {/* AI extracted values */}
      {submission.extracted_values.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {draftCount > 0 && !isValidated && (
            <AcceptAllBanner draftCount={draftCount} acceptedCount={acceptedCount} onAcceptAll={handleAcceptAll} />
          )}

          {Object.entries(panels).map(([panelName, values]) => (
            <div key={panelName} style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: 'var(--mt-elevated)', borderBottom: '1px solid var(--mt-border)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>{panelName}</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--mt-border)' }}>
                      {['Parámetro', 'Valor', 'Unidad', 'Referencia', 'IA', 'Acción'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mt-muted)' }}>{h}</th>
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
        <div style={{ borderRadius: 12, border: '1px dashed var(--mt-border)', background: 'var(--mt-elevated)', padding: '48px 20px', textAlign: 'center' }}>
          <BrainCircuit size={28} color="var(--mt-border)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', margin: 0 }}>Sin valores extraídos</p>
          <p style={{ marginTop: 4, fontSize: 11, color: 'var(--mt-muted)', marginBottom: 16 }}>
            Presiona "Analizar con IA" para que el sistema extraiga los resultados automáticamente.
          </p>
          {canExtract && (
            <AiExtractBtn extracting={extracting} onClick={handleExtract} />
          )}
        </div>
      )}

      {isValidated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: '1px solid #6EE7B7', background: 'var(--mt-success-subtle)', fontSize: 13, color: '#065F46' }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          Resultados validados y fusionados con la orden de laboratorio.
        </div>
      )}
    </ClinicalPage>
  )
}

function AcceptAllBanner({ draftCount, acceptedCount, onAcceptAll }: { draftCount: number; acceptedCount: number; onAcceptAll: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--mt-primary-subtle)', border: '1px solid var(--mt-primary-mist)', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mt-primary-deep)' }}>
        <BrainCircuit size={15} />
        <span>
          <span style={{ fontWeight: 600 }}>{draftCount} valores</span> pendientes de revisión.
          {acceptedCount > 0 && ` ${acceptedCount} aceptados.`}
        </span>
      </div>
      <button
        onClick={onAcceptAll}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', background: hov ? 'var(--mt-primary-deep)' : 'var(--mt-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
      >
        Aceptar todos
      </button>
    </div>
  )
}

function AiExtractBtn({ extracting, onClick }: { extracting: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={extracting}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: hov ? 'var(--mt-primary-deep)' : 'var(--mt-primary)', color: '#fff', border: 'none', borderRadius: 12, cursor: extracting ? 'not-allowed' : 'pointer', opacity: extracting ? 0.6 : 1 }}
    >
      {extracting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <BrainCircuit size={14} />}
      {extracting ? 'Analizando…' : 'Analizar con IA'}
    </button>
  )
}
