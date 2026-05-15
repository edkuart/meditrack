'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileText,
  FolderOpen,
  Gauge,
  Loader2,
  MessageSquareText,
  Mic,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'
import {
  getAiUsageStatus,
  getPatientClinicalSummary,
  listAiUsageEvents,
  listClinicalReviewItems,
  resolveClinicalReviewItem,
  runPatientClinicalCopilot,
  type AiUsageEvent,
  type AiUsageFeature,
  type AiUsageStatus,
  type ClinicalReviewItem,
  type ClinicalReviewPriority,
  type ClinicalCopilotModelTier,
  type ClinicalCopilotMode,
  type ClinicalCopilotResponse,
  type PatientClinicalSummary,
} from '@/lib/doctor/clinical-intelligence-api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalInsight,
  ClinicalPage,
  ClinicalPanel,
  EmptyClinicalState,
  LoadingState,
  MTPill,
  MTProgress,
} from '@/components/doctor/clinical-ui'
import { cn } from '@/lib/utils'

const FEATURE_LABELS: Record<AiUsageFeature, string> = {
  ENCOUNTER_SUMMARY: 'Resumen de consulta',
  PATIENT_SIMPLIFICATION: 'Explicación para paciente',
  CLINICAL_COPILOT: 'Copiloto clínico',
  DOCUMENT_EXTRACTION: 'Extracción documental',
  TRANSCRIPTION: 'Transcripción',
  OTHER: 'Otro uso IA',
}

const PLAN_LABELS: Record<AiUsageStatus['plan'], string> = {
  free: 'Gratuito',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PRIORITY_TONES: Record<ClinicalReviewPriority, 'slate' | 'amber' | 'red'> = {
  LOW: 'slate',
  NORMAL: 'amber',
  HIGH: 'red',
}

const PRIORITY_LABELS: Record<ClinicalReviewPriority, string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
}

const PIPELINES = [
  {
    title: 'Texto clínico',
    description: 'Notas SOAP, consultas, antecedentes y problemas activos entran directo al contexto clínico.',
    icon: FileText,
    status: 'Activo',
    tone: 'green' as const,
  },
  {
    title: 'Documentos y PDFs',
    description: 'Archivos subidos quedan trazables y listos para extracción/revisión médica.',
    icon: FileSearch,
    status: 'Base lista',
    tone: 'blue' as const,
  },
  {
    title: 'Voz de consulta',
    description: 'Transcripciones manuales o externas pueden convertirse en resumen y pendientes de revisión.',
    icon: Mic,
    status: 'Preparado',
    tone: 'sky' as const,
  },
  {
    title: 'Revisión médica',
    description: 'Todo dato generado por IA debe pasar por aprobación antes de volverse dato clínico estable.',
    icon: ShieldCheck,
    status: 'Gobernado',
    tone: 'amber' as const,
  },
]

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function UsageBand({ status }: { status: AiUsageStatus }) {
  const unlimited = status.limit === -1
  const pct = unlimited ? 0 : Math.min(100, Math.round((status.used / status.limit) * 100))
  const tone = unlimited || pct < 70 ? 'blue' : pct < 90 ? 'amber' : 'red'

  return (
    <ClinicalPanel title="Uso de IA del mes" icon={Gauge} accent={tone} padBody collapsible defaultOpen={false}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Plan actual</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-2xl font-bold text-slate-900">{PLAN_LABELS[status.plan]}</p>
              <MTPill tone={unlimited ? 'green' : tone}>{unlimited ? 'Ilimitado' : `${status.remaining} restantes`}</MTPill>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Unidades consumidas</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {unlimited ? status.used : `${status.used}/${status.limit}`}
            </p>
          </div>
        </div>

        {!unlimited && (
          <MTProgress
            value={pct}
            tone={tone}
            label="Consumo mensual"
            sub={`${pct}% usado`}
          />
        )}

        <p className="text-xs text-slate-400">
          Corte iniciado el {new Date(status.period.starts_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </ClinicalPanel>
  )
}

function EventRow({
  event,
  last,
  onOpen,
}: {
  event: AiUsageEvent
  last: boolean
  onOpen: (event: AiUsageEvent) => void
}) {
  const cost = event.estimated_cost_cents > 0 ? `$${(event.estimated_cost_cents / 100).toFixed(2)}` : 'sin costo externo'

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={cn(
        'flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100',
        !last && 'border-b border-slate-100',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{FEATURE_LABELS[event.feature]}</p>
          <MTPill tone="slate">{event.units} unidad{event.units !== 1 ? 'es' : ''}</MTPill>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {event.provider} · {event.model} · {cost}
        </p>
      </div>
      <time className="shrink-0 text-xs text-slate-400">{formatDate(event.created_at)}</time>
    </button>
  )
}

function getAiEventQuestion(event: AiUsageEvent) {
  const question = event.metadata?.question
  return typeof question === 'string' && question.trim().length > 0 ? question.trim() : null
}

function getAiEventMode(event: AiUsageEvent) {
  const mode = event.metadata?.mode
  if (typeof mode !== 'string') return FEATURE_LABELS[event.feature]
  return mode
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, char => char.toUpperCase())
}

type AiEventResponseSnapshot = {
  summary?: string
  answer?: string
  suggested_questions: string[]
  clinical_gaps: string[]
  soft_alerts: string[]
  safety_notice?: string
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function getAiEventResponseSnapshot(event: AiUsageEvent): AiEventResponseSnapshot | null {
  const raw = event.metadata?.response_snapshot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const snapshot = raw as Record<string, unknown>
  const summary = typeof snapshot.summary === 'string' ? snapshot.summary : undefined
  const answer = typeof snapshot.answer === 'string' ? snapshot.answer : undefined
  const safetyNotice = typeof snapshot.safety_notice === 'string' ? snapshot.safety_notice : undefined

  if (!summary && !answer) return null

  return {
    summary,
    answer,
    suggested_questions: metadataStringArray(snapshot.suggested_questions),
    clinical_gaps: metadataStringArray(snapshot.clinical_gaps),
    soft_alerts: metadataStringArray(snapshot.soft_alerts),
    safety_notice: safetyNotice,
  }
}

function PatientAiHistory({
  events,
  onOpen,
}: {
  events: AiUsageEvent[]
  onOpen: (event: AiUsageEvent) => void
}) {
  const copilotEvents = events.filter(event => event.feature === 'CLINICAL_COPILOT')

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Historial de IA del paciente</p>
          <p className="text-xs text-slate-500">Registro de preguntas y usos previos del copiloto.</p>
        </div>
        <MTPill tone="slate">{copilotEvents.length}</MTPill>
      </div>

      {copilotEvents.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-400">
          Sin interacciones previas de IA para este paciente.
        </p>
      ) : (
        <div className="space-y-2">
          {copilotEvents.slice(0, 8).map(event => {
            const question = getAiEventQuestion(event)
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpen(event)}
                className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-100 px-3 py-2 text-left transition hover:border-blue-100 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900">{getAiEventMode(event)}</p>
                    <MTPill tone={event.metadata?.model_tier === 'premium' ? 'green' : 'blue'}>
                      {event.model}
                    </MTPill>
                    <MTPill tone="slate">{event.units} u</MTPill>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">{formatDate(event.created_at)}</time>
                </div>
                <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-slate-500">
                  {question ?? 'Uso del copiloto sin pregunta libre registrada.'}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function parseCopilotAnswer(text: string) {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const sections: Array<{ title: string; items: string[]; body: string[] }> = []
  let current: { title: string; items: string[]; body: string[] } | null = null

  for (const line of lines) {
    const header = line.match(/^([^:]{3,60}):$/)
    if (header) {
      current = { title: header[1], items: [], body: [] }
      sections.push(current)
      continue
    }

    const bullet = line.replace(/^[-•]\s*/, '').trim()
    if (current && line !== bullet) {
      current.items.push(bullet)
      continue
    }

    if (current) current.body.push(line)
  }

  if (sections.length > 0) return sections

  const numberedItems = text
    .split(/\s+\d+\)\s+/)
    .map(part => part.replace(/^\d+\)\s*/, '').trim())
    .filter(part => part.length > 0)

  if (numberedItems.length > 1) {
    const intro = numberedItems[0].includes(':') ? numberedItems[0].split(':').slice(0, -1).join(':') : ''
    const firstItem = numberedItems[0].includes(':') ? numberedItems[0].split(':').at(-1)?.trim() : numberedItems[0]
    return [{
      title: 'Prioridades clínicas',
      body: intro ? [intro] : [],
      items: [firstItem, ...numberedItems.slice(1)]
        .filter((item): item is string => Boolean(item))
        .map(item => item.replace(/\s*Todo debe ser confirmado.*$/i, '').trim())
        .filter(Boolean),
    }]
  }

  return [{ title: 'Respuesta', items: [], body: [text] }]
}

function CopilotResultPanel({ result }: { result: ClinicalCopilotResponse }) {
  const sections = parseCopilotAnswer(result.answer ?? result.summary)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set())
  const [showAlerts, setShowAlerts] = useState(false)
  const [showSuggested, setShowSuggested] = useState(false)
  const [showGaps, setShowGaps] = useState(false)

  const toggleSection = (title: string) =>
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Meta: modelo + validación */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2">
        <MTPill tone="blue">{result.model}</MTPill>
        {result.model_tier === 'premium' && <MTPill tone="green">Premium</MTPill>}
        <MTPill tone="amber">Requiere validación médica</MTPill>
      </div>

      {/* Alertas clínicas — colapsables, fondo rojo siempre visible */}
      {result.soft_alerts.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-red-100 bg-red-50">
          <button
            type="button"
            onClick={() => setShowAlerts(v => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <AlertTriangle size={15} className="shrink-0" />
              Alertas clínicas
            </div>
            <ChevronDown
              size={13}
              className={cn('shrink-0 text-red-400 transition-transform duration-200', showAlerts && 'rotate-180')}
            />
          </button>
          {showAlerts && (
            <div className="space-y-1.5 px-3 pb-3">
              {result.soft_alerts.slice(0, 4).map(alert => (
                <p key={alert} className="break-words text-sm leading-5 text-red-700">{alert}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Secciones colapsables */}
      <div className="divide-y divide-slate-100 pb-2 pt-1">
        {sections.map(section => {
          const expanded = expandedSections.has(section.title)
          return (
            <div key={section.title} className="min-w-0">
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left focus-visible:outline-none"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
                <ChevronDown
                  size={13}
                  className={cn('shrink-0 text-slate-400 transition-transform duration-200', expanded && 'rotate-180')}
                />
              </button>
              {expanded && (
                <div className="pb-2">
                  {section.body.map(line => (
                    <p key={line} className="break-words text-sm leading-6 text-slate-700">{line}</p>
                  ))}
                  {section.items.length > 0 && (
                    <div className="mt-1.5 space-y-2">
                      {section.items.map(item => (
                        <div key={item} className="flex gap-2 text-sm leading-5 text-slate-700">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                          <span className="break-words">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {result.suggested_questions.length > 0 && (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowSuggested(v => !v)}
              className="flex w-full items-center justify-between gap-2 py-2.5 text-left focus-visible:outline-none"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preguntas sugeridas</p>
              <ChevronDown
                size={13}
                className={cn('shrink-0 text-slate-400 transition-transform duration-200', showSuggested && 'rotate-180')}
              />
            </button>
            {showSuggested && (
              <div className="space-y-2 pb-2">
                {result.suggested_questions.slice(0, 5).map(question => (
                  <p key={question} className="break-words rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    {question}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {result.clinical_gaps.length > 0 && (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowGaps(v => !v)}
              className="flex w-full items-center justify-between gap-2 py-2.5 text-left focus-visible:outline-none"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vacíos clínicos</p>
              <ChevronDown
                size={13}
                className={cn('shrink-0 text-slate-400 transition-transform duration-200', showGaps && 'rotate-180')}
              />
            </button>
            {showGaps && (
              <div className="space-y-2 pb-2">
                {result.clinical_gaps.slice(0, 5).map(gap => (
                  <p key={gap} className="break-words rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {gap}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AiEventDetailModal({
  event,
  onClose,
}: {
  event: AiUsageEvent
  onClose: () => void
}) {
  const question = getAiEventQuestion(event)
  const snapshot = getAiEventResponseSnapshot(event)
  const sections = snapshot ? parseCopilotAnswer(snapshot.answer ?? snapshot.summary ?? '') : []
  const tier = typeof event.metadata?.model_tier === 'string' ? event.metadata.model_tier : null
  const cost = event.estimated_cost_cents > 0 ? `$${(event.estimated_cost_cents / 100).toFixed(2)}` : 'sin costo externo'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              Conversación de IA
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{getAiEventMode(event)}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <MTPill tone="blue">{event.model}</MTPill>
              {tier === 'premium' && <MTPill tone="green">Premium</MTPill>}
              <MTPill tone="slate">{event.units} unidad{event.units !== 1 ? 'es' : ''}</MTPill>
              <span className="text-xs text-slate-400">{formatDate(event.created_at)} · {cost}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            aria-label="Cerrar conversación"
          >
            <XCircle size={20} />
          </button>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pregunta</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {question ?? 'Esta interacción no registró una pregunta libre.'}
            </p>
          </div>

          {!snapshot ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              Esta interacción fue registrada antes de archivar respuestas completas. Se conserva la pregunta,
              modelo y consumo; vuelve a ejecutar la pregunta para guardar una conversación consultable.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {snapshot.soft_alerts.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle size={15} />
                    Alertas clínicas
                  </div>
                  <div className="space-y-1.5">
                    {snapshot.soft_alerts.slice(0, 4).map(alert => (
                      <p key={alert} className="text-sm leading-5 text-red-700">{alert}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                {sections.map(section => (
                  <div key={section.title} className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
                    {section.body.map(line => (
                      <p key={line} className="mt-2 break-words text-sm leading-6 text-slate-700">{line}</p>
                    ))}
                    {section.items.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {section.items.map(item => (
                          <div key={item} className="flex gap-2 text-sm leading-5 text-slate-700">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            <span className="break-words">{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {snapshot.suggested_questions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preguntas sugeridas</p>
                  <div className="space-y-2">
                    {snapshot.suggested_questions.slice(0, 5).map(item => (
                      <p key={item} className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{item}</p>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.clinical_gaps.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Vacíos clínicos</p>
                  <div className="space-y-2">
                    {snapshot.clinical_gaps.slice(0, 5).map(item => (
                      <p key={item} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{item}</p>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.safety_notice && (
                <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                  {snapshot.safety_notice}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PatientWorkspace({
  query,
  results,
  selectedPatient,
  summary,
  loadingResults,
  loadingSummary,
  error,
  copilotQuestion,
  copilotModelTier,
  copilotResult,
  patientAiEvents,
  copilotLoading,
  onQueryChange,
  onSelectPatient,
  onCopilotQuestionChange,
  onCopilotModelTierChange,
  onAskCopilot,
  onAskPreset,
  onRunCopilotMode,
  onOpenAiEvent,
}: {
  query: string
  results: Patient[]
  selectedPatient: Patient | null
  summary: PatientClinicalSummary | null
  loadingResults: boolean
  loadingSummary: boolean
  error: string | null
  copilotQuestion: string
  copilotModelTier: ClinicalCopilotModelTier
  copilotResult: ClinicalCopilotResponse | null
  patientAiEvents: AiUsageEvent[]
  copilotLoading: boolean
  onQueryChange: (value: string) => void
  onSelectPatient: (patient: Patient) => void
  onCopilotQuestionChange: (value: string) => void
  onCopilotModelTierChange: (value: ClinicalCopilotModelTier) => void
  onAskCopilot: () => void
  onAskPreset: (question: string) => void
  onRunCopilotMode: (mode: Exclude<ClinicalCopilotMode, 'ASK_CLINICAL_QUESTION'>) => void
  onOpenAiEvent: (event: AiUsageEvent) => void
}) {
  const activeProblems = summary?.problems.filter(problem => problem.status === 'ACTIVE' || problem.status === 'CHRONIC') ?? []
  const patientName = selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : ''

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const toggleCard = (id: string) =>
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <ClinicalPanel title="Trabajar con paciente" icon={UserRound} accent="blue" padBody>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Buscar paciente
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder="Nombre, apellido o documento..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-white">
            {loadingResults ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
                <Loader2 size={15} className="animate-spin" />
                Buscando pacientes...
              </div>
            ) : results.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                {results.map(patient => {
                  const name = `${patient.first_name} ${patient.last_name}`
                  const selected = selectedPatient?.id === patient.id
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => onSelectPatient(patient)}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-3 overflow-hidden border-b border-slate-50 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50',
                        selected && 'bg-blue-50',
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <UserRound size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                        <p className="truncate text-xs text-slate-400">
                          {patient.id_number ?? patient.email ?? patient.phone ?? 'Sin identificador visible'}
                        </p>
                      </div>
                      {selected && <CheckCircle2 size={15} className="shrink-0 text-blue-600" />}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm leading-6 text-slate-400">
                {query.trim().length >= 2
                  ? 'No encontré pacientes con esa búsqueda.'
                  : 'Escribe al menos 2 caracteres para cargar pacientes.'}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-72 min-w-0">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {!selectedPatient ? (
            <EmptyClinicalState
              icon={UserRound}
              title="Selecciona un paciente"
              description="Aquí cargaremos su resumen clínico, problemas activos, documentos y pendientes para trabajar con IA sobre su expediente."
            />
          ) : loadingSummary ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              Cargando contexto clínico...
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Paciente seleccionado</p>
                  <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{patientName}</h2>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {summary.patient.phone ?? summary.patient.email ?? 'Sin contacto registrado'}
                  </p>
                </div>
                <ClinicalButton href={`/patients/${selectedPatient.id}`} icon={FolderOpen} iconRight={ArrowRight}>
                  Abrir ficha
                </ClinicalButton>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[
                  ['Prob.', activeProblems.length],
                  ['Antec.', summary.background.length],
                  ['Cons.', summary.latest_encounters.length],
                  ['Docs.', summary.latest_documents.length],
                  ['Pend.', summary.pending_review_items.length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-semibold text-slate-800">Problemas activos</p>
                  {activeProblems.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-400">Sin problemas activos registrados.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {activeProblems.slice(0, 4).map(problem => {
                        const cardId = `problem-${problem.id}`
                        const expanded = expandedCards.has(cardId)
                        return (
                          <button
                            key={problem.id}
                            type="button"
                            onClick={() => toggleCard(cardId)}
                            className="w-full overflow-hidden py-2.5 text-left transition hover:bg-blue-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <MTPill tone={problem.status === 'CHRONIC' ? 'amber' : 'green'}>
                                #{problem.problem_number}
                              </MTPill>
                              <p className={cn('min-w-0 flex-1 text-sm font-semibold text-slate-900', expanded ? 'break-words' : 'truncate')}>
                                {problem.title}
                              </p>
                              <ChevronDown
                                size={13}
                                className={cn('shrink-0 text-slate-400 transition-transform duration-200', expanded && 'rotate-180')}
                              />
                            </div>
                            {problem.description && (
                              <p className={cn('mt-1 text-xs leading-5 text-slate-500', expanded ? 'break-words' : 'line-clamp-1')}>
                                {problem.description}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-sm font-semibold text-slate-800">Última información</p>
                  <div className="divide-y divide-slate-100">
                    {([
                      {
                        id: 'encounter',
                        label: 'Consulta reciente',
                        text: summary.latest_encounters[0]?.chief_complaint
                          ?? summary.latest_encounters[0]?.summary
                          ?? 'Sin consultas recientes registradas.',
                      },
                      {
                        id: 'document',
                        label: 'Documento reciente',
                        text: summary.latest_documents[0]?.file_name ?? 'Sin documentos recientes.',
                      },
                      {
                        id: 'pending',
                        label: 'Pendientes de revisión',
                        text: summary.pending_review_items[0]?.title ?? 'Sin pendientes para este paciente.',
                      },
                    ] as const).map(({ id, label, text }) => {
                      const cardId = `info-${id}`
                      const expanded = expandedCards.has(cardId)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleCard(cardId)}
                          className="w-full overflow-hidden py-2.5 text-left transition hover:bg-blue-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-400">{label}</p>
                            <ChevronDown
                              size={12}
                              className={cn('shrink-0 text-slate-300 transition-transform duration-200', expanded && 'rotate-180')}
                            />
                          </div>
                          <p className={cn('mt-1 text-sm text-slate-700', expanded ? 'break-words' : 'truncate')}>
                            {text}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50/50 p-3">
                {/* Fila 1: ícono + título / Fila 2: subtítulo + toggle (alineados al texto) */}
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <MessageSquareText size={16} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Preguntar a la IA</p>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 pl-10">
                    <p className="min-w-0 truncate text-xs text-slate-500">Responde usando el expediente seleccionado.</p>
                    <div className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
                      {[
                        ['standard', 'Base'],
                        ['premium', 'Premium'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={copilotLoading}
                          onClick={() => onCopilotModelTierChange(value as ClinicalCopilotModelTier)}
                          className={cn(
                            'h-7 rounded-md px-2.5 text-xs font-semibold transition',
                            copilotModelTier === value
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fila 2: acciones rápidas con scroll horizontal en móvil */}
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  <div className="shrink-0">
                    <ClinicalButton
                      size="sm"
                      variant="outline"
                      disabled={copilotLoading}
                      onClick={() => onAskPreset('Dame un resumen ejecutivo para preparar la consulta: riesgos inmediatos, datos a confirmar, preguntas clave y siguiente paso seguro.')}
                    >
                      Resumen ejecutivo
                    </ClinicalButton>
                  </div>
                  <div className="shrink-0">
                    <ClinicalButton
                      size="sm"
                      variant="outline"
                      disabled={copilotLoading}
                      onClick={() => onRunCopilotMode('PREPARE_CONSULTATION')}
                    >
                      Preparar consulta
                    </ClinicalButton>
                  </div>
                  <div className="shrink-0">
                    <ClinicalButton
                      size="sm"
                      variant="outline"
                      disabled={copilotLoading}
                      onClick={() => onRunCopilotMode('SUGGEST_PATIENT_QUESTIONS')}
                    >
                      Preguntas sugeridas
                    </ClinicalButton>
                  </div>
                  <div className="shrink-0">
                    <ClinicalButton
                      size="sm"
                      variant="outline"
                      disabled={copilotLoading}
                      onClick={() => onRunCopilotMode('REVIEW_CLINICAL_GAPS')}
                    >
                      Vacíos clínicos
                    </ClinicalButton>
                  </div>
                </div>

                {/* Fila 3: textarea + botón */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <textarea
                    value={copilotQuestion}
                    onChange={event => onCopilotQuestionChange(event.target.value)}
                    placeholder="Ej. ¿Qué debería revisar antes de la próxima consulta?"
                    rows={3}
                    className="min-h-20 w-full flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="w-full sm:w-auto">
                    <ClinicalButton
                      icon={copilotLoading ? Loader2 : Send}
                      disabled={copilotLoading || copilotQuestion.trim().length < 3}
                      onClick={onAskCopilot}
                      style={{ width: '100%' }}
                    >
                      {copilotLoading ? 'Consultando...' : 'Preguntar'}
                    </ClinicalButton>
                  </div>
                </div>

                {copilotResult && <CopilotResultPanel result={copilotResult} />}
              </div>

              <PatientAiHistory events={patientAiEvents} onOpen={onOpenAiEvent} />
            </div>
          ) : null}
        </div>
      </div>
    </ClinicalPanel>
  )
}

function ReviewItemRow({
  item,
  resolving,
  onResolve,
}: {
  item: ClinicalReviewItem
  resolving: boolean
  onResolve: (id: string, status: 'APPROVED' | 'REJECTED') => void
}) {
  const [expanded, setExpanded] = useState(false)
  const patientName = item.patient
    ? `${item.patient.first_name} ${item.patient.last_name}`
    : 'Paciente'
  const source = item.document?.file_name ?? item.provenance?.source_label ?? item.encounter?.encounter_type ?? item.item_type
  const confidence = item.confidence != null ? `${Math.round(item.confidence * 100)}%` : null

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      {/* Header row — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <ClipboardCheck size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <MTPill tone={PRIORITY_TONES[item.priority]}>{PRIORITY_LABELS[item.priority]}</MTPill>
            <p className={cn('min-w-0 flex-1 text-sm font-semibold text-slate-900', expanded ? 'break-words' : 'truncate')}>
              {item.title}
            </p>
          </div>
          {!expanded && (
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {patientName} · {formatDate(item.created_at)}
            </p>
          )}
        </div>
        <ChevronDown
          size={13}
          className={cn('shrink-0 text-slate-400 transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>

      {/* Expanded detail + actions */}
      {expanded && (
        <div className="px-4 pb-3">
          {item.summary && (
            <p className="mb-2 break-words text-sm leading-6 text-slate-500">{item.summary}</p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <Link
              href={`/patients/${item.patient_id}`}
              className="font-medium text-blue-600 hover:text-blue-700"
              onClick={e => e.stopPropagation()}
            >
              {patientName}
            </Link>
            <span>{formatDate(item.created_at)}</span>
            {source && <span>{source}</span>}
            {confidence && <span>{confidence}</span>}
          </div>
          <div className="flex justify-end gap-2">
            <ClinicalButton
              size="sm"
              variant="outline"
              icon={XCircle}
              disabled={resolving}
              onClick={() => onResolve(item.id, 'REJECTED')}
            >
              Rechazar
            </ClinicalButton>
            <ClinicalButton
              size="sm"
              icon={CheckCircle2}
              disabled={resolving}
              onClick={() => onResolve(item.id, 'APPROVED')}
            >
              Aprobar
            </ClinicalButton>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClinicalIntelligencePage() {
  const { token } = useAuth()
  const [status, setStatus] = useState<AiUsageStatus | null>(null)
  const [events, setEvents] = useState<AiUsageEvent[]>([])
  const [reviewItems, setReviewItems] = useState<ClinicalReviewItem[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [patientSummary, setPatientSummary] = useState<PatientClinicalSummary | null>(null)
  const [patientAiEvents, setPatientAiEvents] = useState<AiUsageEvent[]>([])
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [copilotModelTier, setCopilotModelTier] = useState<ClinicalCopilotModelTier>('standard')
  const [copilotResult, setCopilotResult] = useState<ClinicalCopilotResponse | null>(null)
  const [selectedAiEvent, setSelectedAiEvent] = useState<AiUsageEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [patientSummaryLoading, setPatientSummaryLoading] = useState(false)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [patientError, setPatientError] = useState<string | null>(null)

  const loadData = useCallback(async (showRefresh = false) => {
    if (!token) return
    if (showRefresh) setRefreshing(true)
    setError(null)
    try {
      const [usageStatus, usageEvents, pendingReviewItems] = await Promise.all([
        getAiUsageStatus(token),
        listAiUsageEvents(token, 25),
        listClinicalReviewItems(token, 'PENDING', 25),
      ])
      setStatus(usageStatus)
      setEvents(usageEvents)
      setReviewItems(pendingReviewItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar inteligencia clínica')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  const handleResolve = useCallback(async (id: string, nextStatus: 'APPROVED' | 'REJECTED') => {
    if (!token) return
    setResolvingId(id)
    setError(null)
    try {
      await resolveClinicalReviewItem(token, id, nextStatus)
      setReviewItems(current => current.filter(item => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver el pendiente clínico')
    } finally {
      setResolvingId(null)
    }
  }, [token])

  const searchPatients = useCallback(async (query: string) => {
    if (!token) return
    const normalized = query.trim()
    if (normalized.length < 2) {
      setPatientResults([])
      return
    }

    setPatientSearchLoading(true)
    setPatientError(null)
    try {
      const result = await listPatients(token, normalized, 1, 8)
      setPatientResults(result.patients)
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'No se pudo buscar pacientes')
    } finally {
      setPatientSearchLoading(false)
    }
  }, [token])

  const selectPatient = useCallback(async (patient: Patient) => {
    if (!token) return
    setSelectedPatient(patient)
    setPatientSummary(null)
    setPatientAiEvents([])
    setCopilotResult(null)
    setCopilotQuestion('')
    setPatientSummaryLoading(true)
    setPatientError(null)
    try {
      const [summary, history] = await Promise.all([
        getPatientClinicalSummary(token, patient.id),
        listAiUsageEvents(token, 50, patient.id),
      ])
      setPatientSummary(summary)
      setPatientAiEvents(history)
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'No se pudo cargar el resumen del paciente')
    } finally {
      setPatientSummaryLoading(false)
    }
  }, [token])

  const runCopilot = useCallback(async (
    mode: ClinicalCopilotMode,
    question?: string,
  ) => {
    if (!token || !selectedPatient) return
    setCopilotLoading(true)
    setPatientError(null)
    try {
      const result = await runPatientClinicalCopilot(token, selectedPatient.id, {
        mode,
        model_tier: copilotModelTier,
        question,
      })
      setCopilotResult(result)
      const history = await listAiUsageEvents(token, 50, selectedPatient.id)
      setPatientAiEvents(history)
      void loadData(true)
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'No se pudo consultar el copiloto clínico')
    } finally {
      setCopilotLoading(false)
    }
  }, [copilotModelTier, loadData, selectedPatient, token])

  const askCopilot = useCallback(() => {
    const question = copilotQuestion.trim()
    if (question.length < 3) return
    void runCopilot('ASK_CLINICAL_QUESTION', question)
  }, [copilotQuestion, runCopilot])

  const askCopilotPreset = useCallback((question: string) => {
    setCopilotQuestion(question)
    void runCopilot('ASK_CLINICAL_QUESTION', question)
  }, [runCopilot])

  const runCopilotMode = useCallback((mode: Exclude<ClinicalCopilotMode, 'ASK_CLINICAL_QUESTION'>) => {
    void runCopilot(mode)
  }, [runCopilot])

  useEffect(() => {
    void Promise.resolve().then(() => loadData())
  }, [loadData])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void searchPatients(patientQuery)
    }, 250)
    return () => window.clearTimeout(id)
  }, [patientQuery, searchPatients])

  const totalUnits = useMemo(() => events.reduce((sum, event) => sum + event.units, 0), [events])
  const copilotEvents = useMemo(() => events.filter(event => event.feature === 'CLINICAL_COPILOT').length, [events])
  const highPriorityReview = useMemo(() => reviewItems.filter(item => item.priority === 'HIGH').length, [reviewItems])

  if (loading) {
    return (
      <ClinicalPage>
        <LoadingState label="Cargando inteligencia clínica..." />
      </ClinicalPage>
    )
  }

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Módulo transversal"
        title="Inteligencia clínica"
        subtitle="Centro operativo para IA, documentos, voz y revisión médica, separado de pacientes y laboratorio."
        icon={BrainCircuit}
        actions={
          <ClinicalButton
            variant="outline"
            icon={refreshing ? Loader2 : RefreshCw}
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            Actualizar
          </ClinicalButton>
        }
        meta={status && <MTPill tone="blue">Plan {PLAN_LABELS[status.plan]}</MTPill>}
      />

      {error && (
        <ClinicalInsight tone="red" title="No se pudo cargar la sección">
          {error}
        </ClinicalInsight>
      )}

      <PatientWorkspace
        query={patientQuery}
        results={patientResults}
        selectedPatient={selectedPatient}
        summary={patientSummary}
        loadingResults={patientSearchLoading}
        loadingSummary={patientSummaryLoading}
        error={patientError}
        copilotQuestion={copilotQuestion}
        copilotModelTier={copilotModelTier}
        copilotResult={copilotResult}
        patientAiEvents={patientAiEvents}
        copilotLoading={copilotLoading}
        onQueryChange={setPatientQuery}
        onSelectPatient={selectPatient}
        onCopilotQuestionChange={setCopilotQuestion}
        onCopilotModelTierChange={setCopilotModelTier}
        onAskCopilot={askCopilot}
        onAskPreset={askCopilotPreset}
        onRunCopilotMode={runCopilotMode}
        onOpenAiEvent={setSelectedAiEvent}
      />

      {status && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <UsageBand status={status} />
          <ClinicalPanel title="Estado operativo" icon={CheckCircle2} accent="green" padBody collapsible defaultOpen={false}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Eventos del mes</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{status.event_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Eventos cargados</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{events.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Pendientes clínicos</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{reviewItems.length}</span>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Las sugerencias de IA son apoyo clínico: el dato final sigue requiriendo validación del médico.
              </div>
            </div>
          </ClinicalPanel>
        </div>
      )}

      <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-white">
        <div className="flex flex-col items-center px-2 py-3 text-center">
          <Sparkles size={15} className="text-blue-500" />
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{totalUnits}</p>
          <p className="mt-0.5 text-xs leading-4 text-slate-400">Unidades IA</p>
        </div>
        <div className="flex flex-col items-center px-2 py-3 text-center">
          <Stethoscope size={15} className="text-green-500" />
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{copilotEvents}</p>
          <p className="mt-0.5 text-xs leading-4 text-slate-400">Copiloto</p>
        </div>
        <div className="flex flex-col items-center px-2 py-3 text-center">
          <ClipboardCheck size={15} className={highPriorityReview ? 'text-red-500' : 'text-amber-500'} />
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{reviewItems.length}</p>
          <p className="mt-0.5 text-xs leading-4 text-slate-400">Pendientes</p>
          {highPriorityReview > 0 && (
            <p className="mt-0.5 text-xs font-medium text-red-500">{highPriorityReview} alta</p>
          )}
        </div>
      </div>

      <ClinicalPanel title="Embudos de información" icon={FileSearch} accent="blue" padBody collapsible defaultOpen={false}>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          {PIPELINES.map(item => {
            const Icon = item.icon
            return (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <MTPill tone={item.tone}>{item.status}</MTPill>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </ClinicalPanel>

      <div className="grid gap-4 lg:grid-cols-[1fr_.9fr]">
        <ClinicalPanel title="Actividad reciente de IA" icon={Clock3} accent="sky" collapsible defaultOpen={false}>
          {events.length === 0 ? (
            <EmptyClinicalState
              icon={BrainCircuit}
              title="Sin actividad de IA todavía"
              description="Cuando el copiloto, extracción documental o transcripción registren uso, aparecerá aquí."
            />
          ) : (
            <div>
              {events.map((event, index) => (
                <EventRow
                  key={event.id}
                  event={event}
                  last={index === events.length - 1}
                  onOpen={setSelectedAiEvent}
                />
              ))}
            </div>
          )}
        </ClinicalPanel>

        <ClinicalPanel
          title="Bandeja de revisión"
          icon={AlertTriangle}
          accent={highPriorityReview ? 'red' : 'amber'}
          collapsible
          defaultOpen={true}
        >
          {reviewItems.length === 0 ? (
            <EmptyClinicalState
              icon={ClipboardCheck}
              title="Sin pendientes clínicos"
              description="Los hallazgos de documentos, voz o copiloto que requieran validación aparecerán aquí."
            />
          ) : (
            <div>
              {reviewItems.map(item => (
                <ReviewItemRow
                  key={item.id}
                  item={item}
                  resolving={resolvingId === item.id}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          )}
        </ClinicalPanel>
      </div>

      {selectedAiEvent && (
        <AiEventDetailModal
          event={selectedAiEvent}
          onClose={() => setSelectedAiEvent(null)}
        />
      )}
    </ClinicalPage>
  )
}
