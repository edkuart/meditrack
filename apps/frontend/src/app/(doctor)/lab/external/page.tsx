'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Upload, ChevronRight, FlaskConical, BrainCircuit, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listExternalSubmissions, SUBMISSION_STATUS_CONFIG,
  type ExternalSubmission, type ExternalSubmissionStatus,
} from '@/lib/doctor/lab-external-api'
import { ClinicalHeader, ClinicalPage } from '@/components/doctor/clinical-ui'
import { Skeleton } from '@/components/ui/skeleton'

function calcAge(dob: string | null | undefined) {
  if (!dob) return null
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))} a`
}

const STATUS_FILTERS: { label: string; value: ExternalSubmissionStatus | '' }[] = [
  { label: 'Todos',           value: '' },
  { label: 'Recibidos',       value: 'RECEIVED' },
  { label: 'Borrador listo',  value: 'DRAFT_READY' },
  { label: 'Validados',       value: 'VALIDATED' },
]

function StatusBadge({ status }: { status: ExternalSubmissionStatus }) {
  const cfg = SUBMISSION_STATUS_CONFIG[status]
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

const CHIP_CONFIG = [
  { label: 'Pendientes de revisión', filter: (s: ExternalSubmission) => s.status === 'RECEIVED',    color: '#B45309', bg: '#FEF3C7', border: '#FDE68A', icon: Clock },
  { label: 'Borrador listo',         filter: (s: ExternalSubmission) => s.status === 'DRAFT_READY', color: 'var(--mt-primary-deep)', bg: 'var(--mt-primary-subtle)', border: 'var(--mt-primary-mist)', icon: BrainCircuit },
  { label: 'Validados',              filter: (s: ExternalSubmission) => s.status === 'VALIDATED',   color: '#065F46', bg: 'var(--mt-success-subtle)', border: '#6EE7B7', icon: CheckCircle2 },
]

const URGENCY_COLOR: Record<ExternalSubmissionStatus, string> = {
  DRAFT_READY: 'var(--mt-primary)',
  RECEIVED:    '#FBBF24',
  AI_EXTRACTING: '#7C3AED',
  VALIDATED:   'var(--mt-success)',
  REJECTED:    'var(--mt-muted)',
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '6px 12px', fontSize: 13, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? 'var(--mt-text)' : hov ? 'var(--mt-elevated)' : 'transparent',
        color: active ? '#fff' : hov ? 'var(--mt-text)' : 'var(--mt-muted)',
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </button>
  )
}

function SubmissionRow({ sub, index, isLast }: { sub: ExternalSubmission; index: number; isLast: boolean }) {
  const [hov, setHov] = useState(false)
  const isPending = sub.status === 'RECEIVED' || sub.status === 'DRAFT_READY'

  return (
    <Link
      href={`/lab/external/${sub.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px', textDecoration: 'none',
        borderBottom: !isLast ? '1px solid var(--mt-border)' : 'none',
        background: hov
          ? 'var(--mt-elevated)'
          : isPending ? 'rgba(251,191,36,.04)' : 'transparent',
        transition: 'background .1s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{
        width: 6, height: 40, borderRadius: 999, flexShrink: 0,
        background: URGENCY_COLOR[sub.status] ?? 'var(--mt-border)',
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: hov ? 'var(--mt-primary)' : 'var(--mt-text)', transition: 'color .1s' }}>
            {sub.patient.first_name} {sub.patient.last_name}
          </span>
          {calcAge(sub.patient.date_of_birth) && (
            <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>{calcAge(sub.patient.date_of_birth)}</span>
          )}
          <StatusBadge status={sub.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--mt-muted)' }}>
          <span>{new Date(sub.submitted_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {(sub.file_count ?? 0) > 0 && (
            <><span style={{ color: 'var(--mt-border)' }}>·</span><span>{sub.file_count} archivo{(sub.file_count ?? 0) > 1 ? 's' : ''}</span></>
          )}
          {(sub.extracted_count ?? 0) > 0 && (
            <><span style={{ color: 'var(--mt-border)' }}>·</span><span style={{ color: 'var(--mt-primary)', fontWeight: 500 }}>{sub.extracted_count} valores extraídos por IA</span></>
          )}
          {sub.patient_notes && (
            <><span style={{ color: 'var(--mt-border)' }}>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{sub.patient_notes}</span></>
          )}
        </div>
      </div>

      <ChevronRight size={15} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
    </Link>
  )
}

export default function LabExternalPage() {
  const { token } = useAuth()
  const [submissions, setSubmissions] = useState<ExternalSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<ExternalSubmissionStatus | ''>('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    listExternalSubmissions(token, activeFilter || undefined)
      .then(setSubmissions)
      .finally(() => setLoading(false))
  }, [token, activeFilter])

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Laboratorio"
        title="Resultados externos"
        subtitle="Documentos enviados por pacientes desde laboratorios externos. Analiza con IA y valida antes de incorporarlos."
        icon={Upload}
      />

      {!loading && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {CHIP_CONFIG.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${item.border}`, background: item.bg }}>
              <item.icon size={14} color={item.color} />
              <span style={{ fontWeight: 600, fontSize: 13, color: item.color }}>{submissions.filter(item.filter).length}</span>
              <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(f => (
          <FilterTab
            key={f.value}
            label={f.label}
            active={activeFilter === f.value}
            onClick={() => setActiveFilter(f.value as ExternalSubmissionStatus | '')}
          />
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div style={{
          borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
          padding: '64px 20px', textAlign: 'center', boxShadow: 'var(--mt-shadow-sm)',
        }}>
          <Upload size={28} color="var(--mt-border)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)' }}>No hay resultados externos</p>
          <p style={{ marginTop: 4, fontSize: 11, color: 'var(--mt-muted)' }}>
            Cuando un paciente envíe sus resultados de otro laboratorio aparecerán aquí.
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
          {submissions.map((sub, i) => (
            <SubmissionRow key={sub.id} sub={sub} index={i} isLast={i === submissions.length - 1} />
          ))}
        </div>
      )}
    </ClinicalPage>
  )
}
