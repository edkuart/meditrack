'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Upload, ChevronRight, FlaskConical, BrainCircuit, CheckCircle2, Clock, Eye } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listExternalSubmissions, SUBMISSION_STATUS_CONFIG,
  type ExternalSubmission, type ExternalSubmissionStatus,
} from '@/lib/doctor/lab-external-api'
import { ClinicalHeader, ClinicalPage, LoadingState } from '@/components/doctor/clinical-ui'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

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
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
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

  const pendingCount = submissions.filter(
    s => s.status === 'RECEIVED' || s.status === 'DRAFT_READY',
  ).length

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Laboratorio"
        title="Resultados externos"
        subtitle="Documentos enviados por pacientes desde laboratorios externos. Analiza con IA y valida antes de incorporarlos."
        icon={Upload}
      />

      {/* Summary chips */}
      {!loading && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Pendientes de revisión', count: submissions.filter(s => s.status === 'RECEIVED').length, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
            { label: 'Borrador listo', count: submissions.filter(s => s.status === 'DRAFT_READY').length, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: BrainCircuit },
            { label: 'Validados', count: submissions.filter(s => s.status === 'VALIDATED').length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
          ].map(item => (
            <div key={item.label} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm', item.bg)}>
              <item.icon size={14} className={item.color} />
              <span className={cn('font-semibold', item.color)}>{item.count}</span>
              <span className="text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value as ExternalSubmissionStatus | '')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors',
              activeFilter === f.value
                ? 'bg-slate-900 text-white font-medium'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
          <Upload size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No hay resultados externos</p>
          <p className="mt-1 text-xs text-slate-400">
            Cuando un paciente envíe sus resultados de otro laboratorio aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {submissions.map((sub, i) => (
            <Link
              key={sub.id}
              href={`/lab/external/${sub.id}`}
              className={cn(
                'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group',
                i < submissions.length - 1 && 'border-b border-slate-100',
                (sub.status === 'RECEIVED' || sub.status === 'DRAFT_READY') && 'bg-amber-50/30 hover:bg-amber-50/60',
              )}
            >
              {/* Urgency indicator */}
              <div className={cn(
                'w-1.5 h-10 rounded-full flex-shrink-0',
                sub.status === 'DRAFT_READY' ? 'bg-blue-400' :
                sub.status === 'RECEIVED'    ? 'bg-amber-400' :
                sub.status === 'VALIDATED'   ? 'bg-emerald-400' : 'bg-slate-200',
              )} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {sub.patient.first_name} {sub.patient.last_name}
                  </span>
                  {calcAge(sub.patient.date_of_birth) && (
                    <span className="text-xs text-slate-400">{calcAge(sub.patient.date_of_birth)}</span>
                  )}
                  <StatusBadge status={sub.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{new Date(sub.submitted_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {(sub.file_count ?? 0) > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span>{sub.file_count} archivo{(sub.file_count ?? 0) > 1 ? 's' : ''}</span>
                    </>
                  )}
                  {(sub.extracted_count ?? 0) > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span className="text-blue-600 font-medium">{sub.extracted_count} valores extraídos por IA</span>
                    </>
                  )}
                  {sub.patient_notes && (
                    <>
                      <span className="text-slate-200">·</span>
                      <span className="truncate max-w-[200px]">{sub.patient_notes}</span>
                    </>
                  )}
                </div>
              </div>

              <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </ClinicalPage>
  )
}
