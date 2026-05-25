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
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'

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
  if (critical > 0) return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mt-danger)' }}>{critical} crítico{critical > 1 ? 's' : ''}</span>
  if (abnormal > 0) return <span style={{ fontSize: 12, fontWeight: 600, color: '#D97706' }}>{abnormal} fuera de rango</span>
  if (results.every(r => r.status === 'NORMAL')) return <span style={{ fontSize: 12, color: 'var(--mt-success)' }}>Todos normales</span>
  return <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{results.length} parámetro{results.length !== 1 ? 's' : ''}</span>
}

// Pending count badge for lab tech worklist
function PendingParams({ results }: { results: LabOrder['results'] }) {
  const pending = results.filter(r => r.status === 'PENDING').length
  const total = results.length
  if (pending === 0) return <span style={{ fontSize: 12, color: 'var(--mt-success)' }}>Todos ingresados</span>
  return <span style={{ fontSize: 12, fontWeight: 500, color: '#B45309' }}>{pending} de {total} pendientes</span>
}

export default function LabPage() {
  const { token, user } = useAuth()
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const canCreateLabOrder = hasPermission(user?.role, PERMISSIONS.LAB_ORDER_WRITE, user?.permissions)
  const canEnterResults = hasPermission(user?.role, PERMISSIONS.LAB_RESULT_WRITE, user?.permissions)
  const isLabTech = user?.role === 'LAB_TECHNICIAN' || (canEnterResults && !canCreateLabOrder)

  useEffect(() => {
    if (!token) return
    listLabOrders(token)
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [token])

  // Lab techs need the full lab queue plus history; action priority is handled by sorting.
  const visible = orders

  const filtered = visible.filter(o => {
    if (!query) return true
    const q = query.toLowerCase()
    const name = `${o.patient.first_name} ${o.patient.last_name}`.toLowerCase()
    return name.includes(q)
  })

  // For lab tech: sort active work first, then completed/cancelled history.
  const sorted = isLabTech
    ? [...filtered].sort((a, b) => {
        const priority: Record<LabOrder['status'], number> = {
          IN_PROGRESS: 0,
          PENDING: 1,
          COMPLETED: 2,
          CANCELLED: 3,
        }
        const diff = priority[a.status] - priority[b.status]
        if (diff !== 0) return diff
        if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1
        if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1
        return new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime()
      })
    : filtered

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow={isLabTech ? 'Laboratorio' : 'Módulo clínico'}
        title={isLabTech ? 'Órdenes de laboratorio' : 'Laboratorio'}
        subtitle={
          isLabTech
            ? 'Órdenes del hospital asignadas al laboratorio. Ingresa resultados y consulta el historial.'
            : 'Órdenes de exámenes y resultados de tus pacientes.'
        }
        icon={FlaskConical}
        actions={
          canCreateLabOrder
            ? <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>
            : undefined
        }
      />

      {/* Summary chips for lab tech */}
      {isLabTech && !loading && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Pendientes de inicio', count: orders.filter(o => o.status === 'PENDING').length,     color: '#B45309', bg: '#FEF3C7', border: '#FDE68A', icon: Clock },
            { label: 'En proceso',           count: orders.filter(o => o.status === 'IN_PROGRESS').length, color: 'var(--mt-primary-deep)', bg: 'var(--mt-primary-subtle)', border: 'var(--mt-primary-mist)', icon: FlaskConical },
            { label: 'Completadas',          count: orders.filter(o => o.status === 'COMPLETED').length,   color: '#065F46', bg: 'var(--mt-success-subtle)', border: '#6EE7B7', icon: FlaskConical },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${item.border}`, background: item.bg }}>
              <item.icon size={14} color={item.color} />
              <span style={{ fontWeight: 600, fontSize: 13, color: item.color }}>{item.count}</span>
              <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mt-muted)', pointerEvents: 'none' }} />
        <Input
          placeholder="Buscar por paciente…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
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
              ? 'No hay órdenes de laboratorio'
              : 'No hay órdenes de laboratorio'
          }
          description={
            query
              ? 'Prueba con otro nombre.'
              : isLabTech
              ? 'Cuando un médico genere una orden aparecerá aquí para procesar o consultar.'
              : 'Crea la primera orden para un paciente.'
          }
          action={!query && canCreateLabOrder && <ClinicalButton href="/lab/new" icon={Plus}>Nueva orden</ClinicalButton>}
        />
      ) : (
        <div style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
          {sorted.map((order, i) => (
            <Link
              key={order.id}
              href={`/lab/${order.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 20px', textDecoration: 'none',
                background: isLabTech && order.status === 'IN_PROGRESS' ? 'rgba(37,99,235,.03)' : 'transparent',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--mt-border)' : 'none',
                transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = isLabTech && order.status === 'IN_PROGRESS' ? 'rgba(37,99,235,.03)' : '')}
            >
              {isLabTech && (
                <div style={{ width: 4, height: 40, borderRadius: 999, flexShrink: 0, background: order.status === 'IN_PROGRESS' ? 'var(--mt-primary)' : '#FCD34D' }} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>
                    {order.patient.first_name} {order.patient.last_name}
                  </span>
                  {calcAge(order.patient.date_of_birth) && (
                    <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>{calcAge(order.patient.date_of_birth)}</span>
                  )}
                  <OrderStatusBadge status={order.status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                    {new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {!isLabTech && order.results.length > 0 && (<><span style={{ color: 'var(--mt-border)' }}>·</span><CriticalCount results={order.results} /></>)}
                  {isLabTech && order.results.length > 0 && (<><span style={{ color: 'var(--mt-border)' }}>·</span><PendingParams results={order.results} /></>)}
                  {order.results.length === 0 && <span style={{ fontSize: 11, color: 'var(--mt-muted)', opacity: 0.6 }}>Sin parámetros definidos</span>}
                </div>
              </div>

              {isLabTech && (
                <div style={{ textAlign: 'right', flexShrink: 0 }} className="hidden sm:block">
                  <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>Ordenado por</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>
                    Dr. {order.doctor.first_name} {order.doctor.last_name}
                  </div>
                </div>
              )}

              <ChevronRight size={15} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </ClinicalPage>
  )
}
