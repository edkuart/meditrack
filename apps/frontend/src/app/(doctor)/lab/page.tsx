'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FlaskConical, Plus, Search, ChevronRight, AlertTriangle, Clock,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listLabOrders, ORDER_STATUS_CONFIG, STATUS_CONFIG, type LabOrder } from '@/lib/doctor/lab-api'
import { ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, EmptyClinicalState } from '@/components/doctor/clinical-ui'
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

// Pending count badge for lab tech worklist
function PendingParams({ results }: { results: LabOrder['results'] }) {
  const pending = results.filter(r => r.status === 'PENDING').length
  const total = results.length
  if (pending === 0) return <span className="text-xs text-emerald-600">Todos ingresados</span>
  return <span className="text-xs font-medium text-amber-700">{pending} de {total} pendientes</span>
}

export default function LabPage() {
  const { token, user } = useAuth()
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const isLabTech = user?.role === 'LAB_TECHNICIAN'

  useEffect(() => {
    if (!token) return
    listLabOrders(token)
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [token])

  // Lab techs only see orders that need work
  const visible = isLabTech
    ? orders.filter(o => o.status === 'PENDING' || o.status === 'IN_PROGRESS')
    : orders

  const filtered = visible.filter(o => {
    if (!query) return true
    const q = query.toLowerCase()
    const name = `${o.patient.first_name} ${o.patient.last_name}`.toLowerCase()
    return name.includes(q)
  })

  // For lab tech: sort IN_PROGRESS first (currently being worked on)
  const sorted = isLabTech
    ? [...filtered].sort((a, b) => {
        if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1
        if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1
        return new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime()
      })
    : filtered

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow={isLabTech ? 'Laboratorio' : 'Módulo clínico'}
        title={isLabTech ? 'Órdenes pendientes' : 'Laboratorio'}
        subtitle={
          isLabTech
            ? 'Órdenes asignadas al laboratorio. Ingresa los resultados cuando estén listos.'
            : 'Órdenes de exámenes y resultados de tus pacientes.'
        }
        icon={FlaskConical}
        actions={
          !isLabTech
            ? <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>
            : undefined
        }
      />

      {/* Summary chips for lab tech */}
      {isLabTech && !loading && (
        <div className="flex gap-3 flex-wrap">
          {[
            {
              label: 'Pendientes de inicio',
              count: orders.filter(o => o.status === 'PENDING').length,
              color: 'text-amber-700',
              bg: 'bg-amber-50 border-amber-200',
              icon: Clock,
            },
            {
              label: 'En proceso',
              count: orders.filter(o => o.status === 'IN_PROGRESS').length,
              color: 'text-blue-700',
              bg: 'bg-blue-50 border-blue-200',
              icon: FlaskConical,
            },
          ].map(item => (
            <div key={item.label} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm', item.bg)}>
              <item.icon size={14} className={item.color} />
              <span className={cn('font-semibold', item.color)}>{item.count}</span>
              <span className="text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      )}

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
      ) : sorted.length === 0 ? (
        <EmptyClinicalState
          icon={FlaskConical}
          title={
            query
              ? 'Sin resultados'
              : isLabTech
              ? 'No hay órdenes pendientes'
              : 'No hay órdenes de laboratorio'
          }
          description={
            query
              ? 'Prueba con otro nombre.'
              : isLabTech
              ? 'Cuando un médico genere una orden aparecerá aquí para procesar.'
              : 'Crea la primera orden para un paciente.'
          }
          action={!query && !isLabTech && <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {sorted.map((order, i) => (
            <Link
              key={order.id}
              href={`/lab/${order.id}`}
              className={cn(
                'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group',
                i < sorted.length - 1 && 'border-b border-slate-100',
                // Highlight IN_PROGRESS orders for lab tech
                isLabTech && order.status === 'IN_PROGRESS' && 'bg-blue-50/40 hover:bg-blue-50',
              )}
            >
              {/* Priority indicator for lab tech */}
              {isLabTech && (
                <div className={cn(
                  'w-1.5 h-10 rounded-full flex-shrink-0',
                  order.status === 'IN_PROGRESS' ? 'bg-blue-400' : 'bg-amber-300',
                )} />
              )}

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
                  {!isLabTech && order.results.length > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <CriticalCount results={order.results} />
                    </>
                  )}
                  {isLabTech && order.results.length > 0 && (
                    <>
                      <span className="text-slate-200">·</span>
                      <PendingParams results={order.results} />
                    </>
                  )}
                  {order.results.length === 0 && (
                    <span className="text-xs text-slate-300">Sin parámetros definidos</span>
                  )}
                </div>
              </div>

              {/* Ordered by info for lab tech */}
              {isLabTech && (
                <div className="hidden sm:block text-right flex-shrink-0">
                  <div className="text-xs text-slate-400">Ordenado por</div>
                  <div className="text-xs font-medium text-slate-600">
                    Dr. {order.doctor.first_name} {order.doctor.last_name}
                  </div>
                </div>
              )}

              <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </ClinicalPage>
  )
}
