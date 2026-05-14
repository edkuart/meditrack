'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FlaskConical, Plus, Search, AlertCircle, CheckCircle2, Clock, XCircle, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listLabOrders, ORDER_STATUS_CONFIG, STATUS_CONFIG, type LabOrder } from '@/lib/doctor/lab-api'
import { ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, EmptyClinicalState } from '@/components/doctor/clinical-ui'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function calcAge(dob: string | null | undefined) {
  if (!dob) return null
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))} a`
}

function OrderStatusBadge({ status }: { status: LabOrder['status'] }) {
  const cfg = ORDER_STATUS_CONFIG[status]
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function CriticalCount({ results }: { results: LabOrder['results'] }) {
  const critical = results.filter(r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW').length
  const abnormal = results.filter(r => r.status === 'HIGH' || r.status === 'LOW').length
  if (critical > 0) return <span className="text-xs font-bold text-red-600">{critical} crítico{critical > 1 ? 's' : ''}</span>
  if (abnormal > 0) return <span className="text-xs font-semibold text-amber-600">{abnormal} fuera de rango</span>
  if (results.every(r => r.status === 'NORMAL')) return <span className="text-xs text-emerald-600">Todos normales</span>
  return <span className="text-xs text-slate-400">{results.length} parámetro{results.length !== 1 ? 's' : ''}</span>
}

export default function LabPage() {
  const { token } = useAuth()
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!token) return
    listLabOrders(token)
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [token])

  const filtered = orders.filter(o => {
    if (!query) return true
    const q = query.toLowerCase()
    const name = `${o.patient.first_name} ${o.patient.last_name}`.toLowerCase()
    return name.includes(q)
  })

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Módulo clínico"
        title="Laboratorio"
        subtitle="Órdenes de exámenes y resultados de tus pacientes."
        icon={FlaskConical}
        actions={
          <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>
        }
      />

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar por paciente…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyClinicalState
          icon={FlaskConical}
          title={query ? 'Sin resultados' : 'No hay órdenes de laboratorio'}
          description={query ? 'Prueba con otro nombre.' : 'Crea la primera orden para un paciente.'}
          action={!query && <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {filtered.map((order, i) => (
            <Link
              key={order.id}
              href={`/lab/${order.id}`}
              className={cn(
                'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group',
                i < filtered.length - 1 && 'border-b border-slate-100',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {order.patient.first_name} {order.patient.last_name}
                  </span>
                  {calcAge(order.patient.date_of_birth) && (
                    <span className="text-xs text-slate-400">{calcAge(order.patient.date_of_birth)}</span>
                  )}
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {order.results.length > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <CriticalCount results={order.results} />
                    </>
                  )}
                  {order.results.length === 0 && (
                    <span className="text-xs text-slate-300">Sin resultados ingresados</span>
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
