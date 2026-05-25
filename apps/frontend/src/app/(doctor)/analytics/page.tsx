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
  ClinicalHeader, ClinicalPage, ClinicalPanel, LoadingState, MetricCard, MTButton,
} from '@/components/doctor/clinical-ui'
import { Badge } from '@/components/ui/badge'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import { cn } from '@/lib/utils'

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      borderRadius: 8, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
      padding: '8px 12px', boxShadow: 'var(--mt-shadow-sm)', fontSize: 12,
    }}>
      <p style={{ fontWeight: 600, color: 'var(--mt-text)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}{p.name === 'Adherencia' ? '%' : ''}</strong></p>
      ))}
    </div>
  )
}

const COHORT_CONFIG = {
  high:    { label: 'Alta (≥80%)',    style: { bg: 'var(--mt-success-subtle)', color: '#065F46', border: '#6EE7B7' }, icon: CheckCircle2, bar: '#10b981' },
  medium:  { label: 'Media (50-79%)', style: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },                  icon: AlertTriangle, bar: '#f59e0b' },
  low:     { label: 'Baja (<50%)',    style: { bg: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)', border: '#fecaca' }, icon: XCircle, bar: '#ef4444' },
  no_data: { label: 'Sin datos',      style: { bg: 'var(--mt-elevated)', color: 'var(--mt-muted)', border: 'var(--mt-border)' }, icon: HelpCircle, bar: '#94a3b8' },
} as const

function CohortRow({ patient, bucket }: { patient: CohortPatient; bucket: keyof typeof COHORT_CONFIG }) {
  const cfg = COHORT_CONFIG[bucket]
  return (
    <Link href={`/patients/${patient.id}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', textDecoration: 'none', transition: 'background .1s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {patient.last_name}, {patient.first_name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '2px 0 0' }}>
          {patient.active_treatments} trat. activo{patient.active_treatments !== 1 ? 's' : ''}
        </p>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        background: cfg.style.bg, color: cfg.style.color, border: `1px solid ${cfg.style.border}`,
        flexShrink: 0, marginLeft: 12,
      }}>
        {patient.overall_score >= 0 ? `${patient.overall_score}%` : '—'}
      </span>
    </Link>
  )
}

function CohortCard({ bucket, patients, total }: { bucket: keyof typeof COHORT_CONFIG; patients: CohortPatient[]; total: number }) {
  const [expanded, setExpanded] = useState(bucket === 'low')
  const cfg = COHORT_CONFIG[bucket]
  const Icon = cfg.icon
  const pct = total > 0 ? Math.round((patients.length / total) * 100) : 0

  return (
    <div style={{ border: '1px solid var(--mt-border)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', border: 'none', background: 'var(--mt-surface)', cursor: 'pointer',
          transition: 'background .1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--mt-surface)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={16} color="var(--mt-muted)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)' }}>{cfg.label}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
            background: cfg.style.bg, color: cfg.style.color, border: `1px solid ${cfg.style.border}`,
          }}>{patients.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 64, background: 'var(--mt-elevated)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
            <div style={{ height: 6, borderRadius: 999, width: `${pct}%`, background: cfg.bar, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--mt-muted)', width: 32, textAlign: 'right' }}>{pct}%</span>
          <ChevronDown size={14} color="var(--mt-muted)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </div>
      </button>
      {expanded && patients.length > 0 && (
        <div style={{ borderTop: '1px solid var(--mt-border)', maxHeight: 256, overflowY: 'auto' }}>
          {patients.map(p => <CohortRow key={p.id} patient={p} bucket={bucket} />)}
        </div>
      )}
      {expanded && patients.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--mt-muted)', padding: '16px 0', borderTop: '1px solid var(--mt-border)', margin: 0 }}>
          Sin pacientes en este rango
        </p>
      )}
    </div>
  )
}

type Period = '30' | '60' | '90'
type WeekRange = '4' | '8' | '12'

function ToggleGroup<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          fontSize: 12, padding: '4px 10px', borderRadius: 8, border: 'none',
          background: value === o.value ? 'var(--mt-primary-subtle)' : 'transparent',
          color: value === o.value ? 'var(--mt-primary-deep)' : 'var(--mt-muted)',
          fontWeight: value === o.value ? 600 : 400,
          cursor: 'pointer', transition: 'all .15s',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { token, user } = useAuth()
  const canViewAnalytics = hasPermission(user?.role, PERMISSIONS.ANALYTICS_READ, user?.permissions)

  if (user && !canViewAnalytics) {
    return (
      <ClinicalPage size="compact">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={22} color="#b45309" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Acceso restringido</p>
          <p style={{ fontSize: 14, color: 'var(--mt-text-2)', maxWidth: 320, margin: 0 }}>La sección de analítica clínica está disponible únicamente para administradores.</p>
          <Link href="/dashboard" style={{ marginTop: 8, fontSize: 13, color: 'var(--mt-primary)', textDecoration: 'none' }}>← Volver al panel</Link>
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
    getClinicTrends(token, Number(weekRange)).then(d => setTrends(d.weeks)).finally(() => setLoadingTrends(false))
  }, [token, weekRange])

  useEffect(() => {
    if (!token) return
    setLoadingCohorts(true)
    getAdherenceCohorts(token, Number(period)).then(setCohorts).finally(() => setLoadingCohorts(false))
  }, [token, period])

  async function handleCsvExport() {
    if (!token) return
    setExportingCsv(true)
    try {
      const res = await fetch(buildCsvExportUrl(), { headers: { Authorization: `Bearer ${token}` } })
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pacientes-${new Date().toISOString().substring(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally { setExportingCsv(false) }
  }

  const total = cohorts ? cohorts.high.length + cohorts.medium.length + cohorts.low.length + cohorts.no_data.length : 0
  const totalNewPatients = trends?.reduce((s, w) => s + w.new_patients, 0) ?? 0
  const totalEncounters = trends?.reduce((s, w) => s + w.encounters_opened, 0) ?? 0
  const validWeeks = trends?.filter(w => w.adherence_rate >= 0) ?? []
  const avgAdherence = validWeeks.length > 0 ? Math.round(validWeeks.reduce((s, w) => s + w.adherence_rate, 0) / validWeeks.length) : null
  const lastWeek = trends?.at(-1)
  const prevWeek = trends?.at(-2)
  function delta(curr: number, prev: number | undefined) {
    if (prev == null || prev === 0) return ''
    const d = curr - prev
    return d > 0 ? `+${d}` : String(d)
  }

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
          <MTButton variant="outline" size="sm" icon={exportingCsv ? Loader2 : Download} disabled={exportingCsv} onClick={handleCsvExport}>
            Exportar CSV
          </MTButton>
        }
      />

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

      {/* Weekly trends */}
      <div style={{ borderRadius: 14, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mt-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="var(--mt-primary)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>KPIs semanales</span>
          </div>
          <ToggleGroup
            value={weekRange}
            options={[{ value: '4', label: '4sem' }, { value: '8', label: '8sem' }, { value: '12', label: '12sem' }]}
            onChange={setWeekRange}
          />
        </div>
        <div style={{ padding: 20 }}>
          {loadingTrends ? (
            <LoadingState label="Cargando tendencias..." />
          ) : !chartData.length ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)', padding: '40px 0' }}>Sin datos en el período seleccionado</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)', marginBottom: 12 }}>Pacientes nuevos y consultas por semana</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barGap={2} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mt-border)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--mt-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--mt-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="Nuevos pacientes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Consultas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)', marginBottom: 12 }}>Adherencia promedio semanal (%)</p>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="adherenceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--mt-border)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--mt-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--mt-muted)' }} axisLine={false} tickLine={false} domain={[0, 100]} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="Adherencia" stroke="#10b981" strokeWidth={2} fill="url(#adherenceGradient)" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      <ClinicalPanel
        title="Cohortes de adherencia"
        icon={Activity}
        actions={
          <ToggleGroup
            value={period}
            options={[{ value: '30', label: '30d' }, { value: '60', label: '60d' }, { value: '90', label: '90d' }]}
            onChange={setPeriod}
          />
        }
      >
        {loadingCohorts ? <LoadingState label="Cargando cohortes..." /> : !cohorts ? null : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Summary bar */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 10, marginBottom: 8 }}>
              {(['high', 'medium', 'low', 'no_data'] as const).map(b => {
                const pct = total > 0 ? (cohorts[b].length / total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div key={b} title={`${COHORT_CONFIG[b].label}: ${cohorts[b].length} (${Math.round(pct)}%)`}
                    style={{ width: `${pct}%`, background: COHORT_CONFIG[b].bar, transition: 'width .4s' }} />
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
