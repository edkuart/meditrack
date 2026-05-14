'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileSearch,
  FileText,
  Gauge,
  Loader2,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getAiUsageStatus,
  listAiUsageEvents,
  type AiUsageEvent,
  type AiUsageFeature,
  type AiUsageStatus,
} from '@/lib/doctor/clinical-intelligence-api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalInsight,
  ClinicalPage,
  ClinicalPanel,
  EmptyClinicalState,
  LoadingState,
  MetricCard,
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
    <ClinicalPanel title="Uso de IA del mes" icon={Gauge} accent={tone} padBody>
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

function EventRow({ event, last }: { event: AiUsageEvent; last: boolean }) {
  const cost = event.estimated_cost_cents > 0 ? `$${(event.estimated_cost_cents / 100).toFixed(2)}` : 'sin costo externo'

  return (
    <div className={cn('flex items-center gap-4 px-5 py-3.5', !last && 'border-b border-slate-100')}>
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
    </div>
  )
}

export default function ClinicalIntelligencePage() {
  const { token } = useAuth()
  const [status, setStatus] = useState<AiUsageStatus | null>(null)
  const [events, setEvents] = useState<AiUsageEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (showRefresh = false) => {
    if (!token) return
    if (showRefresh) setRefreshing(true)
    setError(null)
    try {
      const [usageStatus, usageEvents] = await Promise.all([
        getAiUsageStatus(token),
        listAiUsageEvents(token, 25),
      ])
      setStatus(usageStatus)
      setEvents(usageEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar inteligencia clínica')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    void Promise.resolve().then(() => loadData())
  }, [loadData])

  const totalUnits = useMemo(() => events.reduce((sum, event) => sum + event.units, 0), [events])
  const externalCost = useMemo(() => events.reduce((sum, event) => sum + event.estimated_cost_cents, 0), [events])
  const copilotEvents = useMemo(() => events.filter(event => event.feature === 'CLINICAL_COPILOT').length, [events])

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

      {status && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <UsageBand status={status} />
          <ClinicalPanel title="Estado operativo" icon={CheckCircle2} accent="green" padBody>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Eventos del mes</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{status.event_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Eventos cargados</span>
                <span className="text-lg font-bold tabular-nums text-slate-900">{events.length}</span>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Las sugerencias de IA son apoyo clínico: el dato final sigue requiriendo validación del médico.
              </div>
            </div>
          </ClinicalPanel>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={Sparkles}
          label="Unidades en eventos recientes"
          value={totalUnits}
          helper="Según los últimos registros cargados"
          tone="blue"
        />
        <MetricCard
          icon={Stethoscope}
          label="Usos de copiloto"
          value={copilotEvents}
          helper="Consultas, SOAP y preguntas sugeridas"
          tone="green"
        />
        <MetricCard
          icon={Archive}
          label="Costo externo estimado"
          value={`$${(externalCost / 100).toFixed(2)}`}
          helper="Modelos locales no suman costo"
          tone="slate"
          animate={false}
        />
      </div>

      <ClinicalPanel title="Embudos de información" icon={FileSearch} accent="blue" padBody>
        <div className="grid gap-3 md:grid-cols-2">
          {PIPELINES.map(item => {
            const Icon = item.icon
            return (
              <div key={item.title} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex items-start gap-3">
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
              </div>
            )
          })}
        </div>
      </ClinicalPanel>

      <div className="grid gap-4 lg:grid-cols-[1fr_.9fr]">
        <ClinicalPanel title="Actividad reciente de IA" icon={Clock3} accent="sky">
          {events.length === 0 ? (
            <EmptyClinicalState
              icon={BrainCircuit}
              title="Sin actividad de IA todavía"
              description="Cuando el copiloto, extracción documental o transcripción registren uso, aparecerá aquí."
            />
          ) : (
            <div>
              {events.map((event, index) => (
                <EventRow key={event.id} event={event} last={index === events.length - 1} />
              ))}
            </div>
          )}
        </ClinicalPanel>

        <ClinicalPanel title="Próximas conexiones" icon={AlertTriangle} accent="amber" padBody>
          <div className="space-y-3">
            {[
              'Bandeja global de pendientes clínicos por revisar.',
              'Procesamiento automático de PDF e imágenes con extracción estructurada.',
              'Transcripción de voz con creación de resumen y borrador SOAP.',
              'Selector de proveedor/modelo para funciones premium.',
            ].map(item => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                <p className="text-sm leading-5 text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </ClinicalPanel>
      </div>
    </ClinicalPage>
  )
}
