'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Users, Stethoscope, Activity,
  Download, Loader2, ChevronDown,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getClinicTrends, getAdherenceCohorts, buildCsvExportUrl,
  type WeeklyTrend, type AdherenceCohorts, type CohortPatient,
} from '@/lib/doctor/analytics-api'
import {
  ClinicalHeader,
  ClinicalPage,
  ClinicalPanel,
  LoadingState,
  MetricCard,
} from '@/components/doctor/clinical-ui'

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarChart({
  data,
  getValue,
  getLabel,
  colorClass = 'bg-blue-500',
  height = 80,
}: {
  data: WeeklyTrend[]
  getValue: (w: WeeklyTrend) => number
  getLabel: (v: number) => string
  colorClass?: string
  height?: number
}) {
  if (!data.length) return null
  const values = data.map(getValue)
  const max = Math.max(...values, 1)

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((w, i) => {
        const v = values[i] ?? 0
        const barH = max > 0 ? Math.round((v / max) * height) : 0
        return (
          <div key={w.week_start} className="flex-1 flex flex-col items-center justify-end group relative">
            <div
              className={`w-full rounded-t-sm ${colorClass} opacity-80 group-hover:opacity-100 transition-opacity`}
              style={{ height: Math.max(barH, 2) }}
            />
            <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {w.week_start.substring(5)}: {getLabel(v)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Cohort section ───────────────────────────────────────────────────────────

const COHORT_CONFIG = {
  high:    { label: 'Alta (≥80%)',    color: 'bg-green-100 text-green-700',  icon: CheckCircle2,   bar: 'bg-green-500' },
  medium:  { label: 'Media (50-79%)', color: 'bg-amber-100 text-amber-700',  icon: AlertTriangle,  bar: 'bg-amber-400' },
  low:     { label: 'Baja (<50%)',    color: 'bg-red-100 text-red-600',      icon: XCircle,        bar: 'bg-red-500'   },
  no_data: { label: 'Sin datos',      color: 'bg-slate-100 text-slate-500',  icon: HelpCircle,     bar: 'bg-slate-300' },
} as const

function CohortRow({ patient, bucket }: { patient: CohortPatient; bucket: keyof typeof COHORT_CONFIG }) {
  const cfg = COHORT_CONFIG[bucket]
  const score = patient.overall_score
  return (
    <Link
      href={`/patients/${patient.id}`}
      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors group"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {patient.last_name}, {patient.first_name}
        </p>
        <p className="text-xs text-slate-400">
          {patient.active_treatments} trat. activo{patient.active_treatments !== 1 ? 's' : ''}
        </p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
        {score >= 0 ? `${score}%` : '—'}
      </span>
    </Link>
  )
}

function CohortCard({
  bucket, patients, total,
}: {
  bucket: keyof typeof COHORT_CONFIG
  patients: CohortPatient[]
  total: number
}) {
  const [expanded, setExpanded] = useState(bucket === 'low')
  const cfg = COHORT_CONFIG[bucket]
  const Icon = cfg.icon
  const pct = total > 0 ? Math.round((patients.length / total) * 100) : 0

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={cfg.color.split(' ')[1]} />
          <span className="text-sm font-medium text-slate-800">{cfg.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>
            {patients.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 bg-slate-100 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && patients.length > 0 && (
        <div className="divide-y divide-slate-50 border-t border-slate-100 max-h-64 overflow-y-auto">
          {patients.map(p => <CohortRow key={p.id} patient={p} bucket={bucket} />)}
        </div>
      )}
      {expanded && patients.length === 0 && (
        <p className="text-center text-xs text-slate-400 py-4 border-t border-slate-100">Sin pacientes en este rango</p>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Period = '30' | '60' | '90'
type WeekRange = '4' | '8' | '12'

export default function AnalyticsPage() {
  const { token } = useAuth()
  const [trends, setTrends] = useState<WeeklyTrend[] | null>(null)
  const [cohorts, setCohorts] = useState<AdherenceCohorts | null>(null)
  const [loadingTrends, setLoadingTrends] = useState(true)
  const [loadingCohorts, setLoadingCohorts] = useState(true)
  const [period, setPeriod] = useState<Period>('30')
  const [weekRange, setWeekRange] = useState<WeekRange>('12')
  const [exportingCsv, setExportingCsv] = useState(false)

  useEffect(() => {
    if (!token) return
    setLoadingTrends(true)
    getClinicTrends(token, Number(weekRange))
      .then(d => setTrends(d.weeks))
      .finally(() => setLoadingTrends(false))
  }, [token, weekRange])

  useEffect(() => {
    if (!token) return
    setLoadingCohorts(true)
    getAdherenceCohorts(token, Number(period))
      .then(setCohorts)
      .finally(() => setLoadingCohorts(false))
  }, [token, period])

  async function handleCsvExport() {
    if (!token) return
    setExportingCsv(true)
    try {
      const url = buildCsvExportUrl()
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pacientes-${new Date().toISOString().substring(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExportingCsv(false)
    }
  }

  const total = cohorts ? cohorts.high.length + cohorts.medium.length + cohorts.low.length + cohorts.no_data.length : 0

  // Summary metrics from trends
  const lastWeek = trends?.at(-1)
  const prevWeek = trends?.at(-2)
  const totalNewPatients = trends?.reduce((s, w) => s + w.new_patients, 0) ?? 0
  const totalEncounters = trends?.reduce((s, w) => s + w.encounters_opened, 0) ?? 0
  const validWeeks = trends?.filter(w => w.adherence_rate >= 0) ?? []
  const avgAdherence = validWeeks.length > 0
    ? Math.round(validWeeks.reduce((s, w) => s + w.adherence_rate, 0) / validWeeks.length)
    : null

  function delta(curr: number, prev: number | undefined): string {
    if (prev == null || prev === 0) return ''
    const d = curr - prev
    return d > 0 ? `+${d}` : String(d)
  }

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Business Intelligence"
        title="Analytics de clínica"
        subtitle="KPIs semanales, cohortes de adherencia y exportación de datos."
        icon={TrendingUp}
        actions={
          <button
            onClick={handleCsvExport}
            disabled={exportingCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 transition-colors"
          >
            {exportingCsv ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar pacientes CSV
          </button>
        }
      />

      {/* Summary metrics from last week */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={Users}
          label={`Nuevos pacientes (${weekRange} sem.)`}
          value={trends ? totalNewPatients : '—'}
          helper={lastWeek ? `Última semana: ${lastWeek.new_patients}${prevWeek ? ` (${delta(lastWeek.new_patients, prevWeek.new_patients)})` : ''}` : undefined}
          tone="blue"
        />
        <MetricCard
          icon={Stethoscope}
          label={`Consultas abiertas (${weekRange} sem.)`}
          value={trends ? totalEncounters : '—'}
          helper={lastWeek ? `Última semana: ${lastWeek.encounters_opened}` : undefined}
          tone="blue"
        />
        <MetricCard
          icon={Activity}
          label="Adherencia promedio"
          value={avgAdherence != null ? `${avgAdherence}%` : '—'}
          helper={avgAdherence != null ? (avgAdherence >= 80 ? 'Excelente' : avgAdherence >= 60 ? 'Aceptable' : 'Requiere atención') : 'Sin dosis en período'}
          tone={avgAdherence != null ? (avgAdherence >= 80 ? 'green' : avgAdherence >= 60 ? 'amber' : 'red') : 'slate'}
        />
      </div>

      {/* Weekly trends chart */}
      <ClinicalPanel
        title="KPIs semanales"
        icon={TrendingUp}
        actions={
          <div className="flex gap-1">
            {(['4', '8', '12'] as WeekRange[]).map(w => (
              <button
                key={w}
                onClick={() => setWeekRange(w)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${weekRange === w ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {w}sem
              </button>
            ))}
          </div>
        }
      >
        {loadingTrends ? (
          <LoadingState label="Cargando tendencias..." />
        ) : !trends?.length ? (
          <p className="text-center text-sm text-slate-400 py-8">Sin datos en el período seleccionado</p>
        ) : (
          <div className="p-5 flex flex-col gap-6">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Nuevos pacientes por semana</p>
              <BarChart
                data={trends}
                getValue={w => w.new_patients}
                getLabel={v => `${v} pacientes`}
                colorClass="bg-blue-500"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Consultas abiertas por semana</p>
              <BarChart
                data={trends}
                getValue={w => w.encounters_opened}
                getLabel={v => `${v} consultas`}
                colorClass="bg-indigo-500"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Adherencia promedio por semana</p>
              <BarChart
                data={trends}
                getValue={w => Math.max(0, w.adherence_rate)}
                getLabel={v => `${v}%`}
                colorClass="bg-green-500"
                height={60}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-400">{trends[0]?.week_start?.substring(5)}</span>
                <span className="text-[10px] text-slate-400">{trends.at(-1)?.week_start?.substring(5)}</span>
              </div>
            </div>

            {/* Trend table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 font-medium text-slate-400">Semana</th>
                    <th className="text-right py-2 pr-4 font-medium text-slate-400">Pacientes</th>
                    <th className="text-right py-2 pr-4 font-medium text-slate-400">Consultas</th>
                    <th className="text-right py-2 font-medium text-slate-400">Adherencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...trends].reverse().map(w => (
                    <tr key={w.week_start} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-500">{w.week_start}</td>
                      <td className="py-2 pr-4 text-right font-medium">{w.new_patients}</td>
                      <td className="py-2 pr-4 text-right font-medium">{w.encounters_opened}</td>
                      <td className={`py-2 text-right font-semibold ${
                        w.adherence_rate < 0 ? 'text-slate-300'
                        : w.adherence_rate >= 80 ? 'text-green-600'
                        : w.adherence_rate >= 60 ? 'text-amber-600'
                        : 'text-red-500'
                      }`}>
                        {w.adherence_rate >= 0 ? `${w.adherence_rate}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ClinicalPanel>

      {/* Adherence cohorts */}
      <ClinicalPanel
        title="Cohortes de adherencia"
        icon={Activity}
        actions={
          <div className="flex gap-1">
            {(['30', '60', '90'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${period === p ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {p}d
              </button>
            ))}
          </div>
        }
      >
        {loadingCohorts ? (
          <LoadingState label="Cargando cohortes..." />
        ) : !cohorts ? null : (
          <div className="p-4 flex flex-col gap-2">
            {/* Distribution bar */}
            <div className="flex rounded-lg overflow-hidden h-3 mb-4">
              {(['high', 'medium', 'low', 'no_data'] as const).map(b => {
                const pct = total > 0 ? (cohorts[b].length / total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={b}
                    title={`${COHORT_CONFIG[b].label}: ${cohorts[b].length} (${Math.round(pct)}%)`}
                    className={`${COHORT_CONFIG[b].bar} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                )
              })}
            </div>

            {(['high', 'medium', 'low', 'no_data'] as const).map(b => (
              <CohortCard key={b} bucket={b} patients={cohorts[b]} total={total} />
            ))}
          </div>
        )}
      </ClinicalPanel>
    </ClinicalPage>
  )
}
