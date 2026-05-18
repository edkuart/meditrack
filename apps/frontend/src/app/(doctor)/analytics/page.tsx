'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Users, Stethoscope, Activity,
  Download, Loader2,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, ChevronDown,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Tooltip personalizado ────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}{p.name === 'Adherencia' ? '%' : ''}</strong></p>
      ))}
    </div>
  )
}

// ─── Cohort ───────────────────────────────────────────────────────────────────
const COHORT_CONFIG = {
  high:    { label: 'Alta (≥80%)',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, bar: '#10b981' },
  medium:  { label: 'Media (50-79%)', cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertTriangle, bar: '#f59e0b' },
  low:     { label: 'Baja (<50%)',    cls: 'bg-red-50 text-red-600 border-red-200',             icon: XCircle,      bar: '#ef4444' },
  no_data: { label: 'Sin datos',      cls: 'bg-slate-100 text-slate-500 border-slate-200',      icon: HelpCircle,   bar: '#94a3b8' },
} as const

function CohortRow({ patient, bucket }: { patient: CohortPatient; bucket: keyof typeof COHORT_CONFIG }) {
  const cfg = COHORT_CONFIG[bucket]
  return (
    <Link
      href={`/patients/${patient.id}`}
      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {patient.last_name}, {patient.first_name}
        </p>
        <p className="text-xs text-slate-400">
          {patient.active_treatments} trat. activo{patient.active_treatments !== 1 ? 's' : ''}
        </p>
      </div>
      <Badge variant="outline" className={cn('text-xs font-semibold', cfg.cls)}>
        {patient.overall_score >= 0 ? `${patient.overall_score}%` : '—'}
      </Badge>
    </Link>
  )
}

function CohortCard({ bucket, patients, total }: { bucket: keyof typeof COHORT_CONFIG; patients: CohortPatient[]; total: number }) {
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
          <Icon size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-800">{cfg.label}</span>
          <Badge variant="outline" className={cn('text-xs font-semibold', cfg.cls)}>{patients.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: cfg.bar }} />
          </div>
          <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
          <ChevronDown size={14} className={cn('text-slate-400 transition-transform', expanded && 'rotate-180')} />
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

// ─── Main ─────────────────────────────────────────────────────────────────────
type Period = '30' | '60' | '90'
type WeekRange = '4' | '8' | '12'

const ADMIN_ROLES = new Set(['ADMIN_CLINIC', 'SUPER_ADMIN'])

export default function AnalyticsPage() {
  const { token, user } = useAuth()

  if (user && !ADMIN_ROLES.has(user.role)) {
    return (
      <ClinicalPage size="compact">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '64px 24px', textAlign: 'center', gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#fef3c7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={22} color="#b45309" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>
            Acceso restringido
          </p>
          <p style={{ fontSize: 14, color: 'var(--mt-text-2)', maxWidth: 320, margin: 0 }}>
            La sección de analítica clínica está disponible únicamente para administradores.
          </p>
          <Link href="/dashboard" style={{
            marginTop: 8, fontSize: 13, color: 'var(--mt-primary)', textDecoration: 'none',
          }}>
            ← Volver al panel
          </Link>
        </div>
      </ClinicalPage>
    )
  }
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

  const total = cohorts
    ? cohorts.high.length + cohorts.medium.length + cohorts.low.length + cohorts.no_data.length
    : 0

  const totalNewPatients = trends?.reduce((s, w) => s + w.new_patients, 0) ?? 0
  const totalEncounters = trends?.reduce((s, w) => s + w.encounters_opened, 0) ?? 0
  const validWeeks = trends?.filter(w => w.adherence_rate >= 0) ?? []
  const avgAdherence = validWeeks.length > 0
    ? Math.round(validWeeks.reduce((s, w) => s + w.adherence_rate, 0) / validWeeks.length)
    : null

  const lastWeek = trends?.at(-1)
  const prevWeek = trends?.at(-2)
  function delta(curr: number, prev: number | undefined) {
    if (prev == null || prev === 0) return ''
    const d = curr - prev
    return d > 0 ? `+${d}` : String(d)
  }

  // Prepare chart data
  const chartData = trends?.map(w => ({
    week: w.week_start.substring(5),
    'Nuevos pacientes': w.new_patients,
    'Consultas': w.encounters_opened,
    'Adherencia': Math.max(0, w.adherence_rate),
  })) ?? []

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Business Intelligence"
        title="Analytics de clínica"
        subtitle="KPIs semanales, cohortes de adherencia y exportación de datos."
        icon={TrendingUp}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleCsvExport}
            disabled={exportingCsv}
            className="gap-1.5 text-slate-600 hover:text-blue-600"
          >
            {exportingCsv ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar CSV
          </Button>
        }
      />

      {/* KPI cards */}
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
          helper={avgAdherence != null
            ? (avgAdherence >= 80 ? 'Excelente' : avgAdherence >= 60 ? 'Aceptable' : 'Requiere atención')
            : 'Sin dosis en período'}
          tone={avgAdherence != null ? (avgAdherence >= 80 ? 'green' : avgAdherence >= 60 ? 'amber' : 'red') : 'slate'}
        />
      </div>

      {/* Weekly trends — Recharts */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            KPIs semanales
          </CardTitle>
          <div className="flex gap-1">
            {(['4', '8', '12'] as WeekRange[]).map(w => (
              <button
                key={w}
                onClick={() => setWeekRange(w)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
                  weekRange === w ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600',
                )}
              >
                {w}sem
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingTrends ? (
            <LoadingState label="Cargando tendencias..." />
          ) : !chartData.length ? (
            <p className="text-center text-sm text-slate-400 py-10">Sin datos en el período seleccionado</p>
          ) : (
            <div className="space-y-6 pt-2">
              {/* Patients + Encounters — grouped bar */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-3">Pacientes nuevos y consultas por semana</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barGap={2} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="Nuevos pacientes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Consultas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Adherence — area chart */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-3">Adherencia promedio semanal (%)</p>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="adherenceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    {/* 80% target line */}
                    <Area type="monotone" dataKey="Adherencia" stroke="#10b981" strokeWidth={2} fill="url(#adherenceGradient)" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                className={cn(
                  'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
                  period === p ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600',
                )}
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
            <div className="flex rounded-lg overflow-hidden h-3 mb-4">
              {(['high', 'medium', 'low', 'no_data'] as const).map(b => {
                const pct = total > 0 ? (cohorts[b].length / total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={b}
                    title={`${COHORT_CONFIG[b].label}: ${cohorts[b].length} (${Math.round(pct)}%)`}
                    className="transition-all"
                    style={{ width: `${pct}%`, background: COHORT_CONFIG[b].bar }}
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
