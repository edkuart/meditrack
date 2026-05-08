'use client'

import { useEffect, useState } from 'react'
import { Users, Activity, CalendarCheck, TrendingUp, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getClinicSummary, type ClinicSummary } from '@/lib/doctor/analytics-api'

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  sub?: string
  color?: 'blue' | 'green' | 'amber' | 'slate'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-500',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function DoseProgressBar({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const color = pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarCheck size={16} className="text-slate-500" />
          <h3 className="font-semibold text-slate-800">Dosis de hoy</h3>
        </div>
        <span className="text-sm font-bold text-slate-700">{pct}%</span>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
          Confirmadas: <strong className="text-slate-700 ml-1">{confirmed}</strong>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />
          Total: <strong className="text-slate-700 ml-1">{total}</strong>
        </span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { token } = useAuth()
  const [summary, setSummary] = useState<ClinicSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    getClinicSummary(token)
      .then(setSummary)
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4">{error}</div>
      ) : summary ? (
        <div className="flex flex-col gap-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<Users size={18} />}
              label="Pacientes activos"
              value={summary.active_patients}
              sub={`${summary.total_patients} totales`}
              color="blue"
            />
            <StatCard
              icon={<Activity size={18} />}
              label="Tratamientos activos"
              value={summary.active_treatments}
              color="green"
            />
            <StatCard
              icon={<TrendingUp size={18} />}
              label="Nuevos este mes"
              value={summary.monthly_new_patients}
              color="amber"
            />
            <StatCard
              icon={<CalendarCheck size={18} />}
              label="Dosis confirmadas hoy"
              value={summary.today_doses_confirmed}
              sub={`de ${summary.today_doses_total} programadas`}
              color={summary.today_doses_total > 0 && (summary.today_doses_confirmed / summary.today_doses_total) >= 0.8 ? 'green' : 'amber'}
            />
          </div>

          {/* Today dose progress */}
          {summary.today_doses_total > 0 && (
            <DoseProgressBar
              confirmed={summary.today_doses_confirmed}
              total={summary.today_doses_total}
            />
          )}

          {/* Empty state if no data yet */}
          {summary.total_patients === 0 && (
            <div className="bg-blue-50 rounded-2xl p-6 text-center mt-4">
              <p className="text-blue-700 font-medium">¡Bienvenido a meditrack!</p>
              <p className="text-blue-600 text-sm mt-1">
                Comienza agregando tu primer paciente y creando su plan de tratamiento.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
