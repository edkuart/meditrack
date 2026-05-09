'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, AlertCircle, Zap, Shield, Loader2, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getBillingStatus, createCheckoutSession, createPortalSession, type BillingStatus } from '@/lib/doctor/billing-api'

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100))
  const nearLimit = !unlimited && pct >= 80

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={`font-medium tabular-nums ${nearLimit ? 'text-amber-600' : 'text-slate-700'}`}>
          {unlimited ? `${used} / Ilimitado` : `${used} / ${max}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${nearLimit ? 'bg-amber-400' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function BillingPage() {
  const { token } = useAuth()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upgraded = searchParams.get('upgraded') === 'true'
  const cancelled = searchParams.get('cancelled') === 'true'

  useEffect(() => {
    if (!token) return
    getBillingStatus(token)
      .then(setStatus)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleUpgrade() {
    if (!token) return
    setActionLoading(true)
    try {
      const { url } = await createCheckoutSession(token)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar el pago')
      setActionLoading(false)
    }
  }

  async function handleManage() {
    if (!token) return
    setActionLoading(true)
    try {
      const { url } = await createPortalSession(token)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir el portal de facturación')
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan y pagos</h1>
        <p className="text-slate-500 text-sm mt-1">Gestiona tu suscripción y revisa el uso de la clínica.</p>
      </div>

      {upgraded && (
        <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={18} className="shrink-0" />
          ¡Suscripción activada! Tu plan Pro ya está activo.
        </div>
      )}

      {cancelled && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <AlertCircle size={18} className="shrink-0" />
          Proceso cancelado. No se realizó ningún cargo.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {status && (
        <>
          {/* Current plan card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {status.plan === 'free' ? (
                  <Shield size={20} className="text-slate-400" />
                ) : (
                  <Zap size={20} className="text-blue-500" />
                )}
                <div>
                  <p className="text-sm text-slate-500">Plan actual</p>
                  <p className="text-lg font-bold text-slate-900">{PLAN_LABELS[status.plan] ?? status.plan}</p>
                </div>
              </div>

              {status.plan === 'free' ? (
                <button
                  onClick={handleUpgrade}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Actualizar a Pro
                </button>
              ) : (
                <button
                  onClick={handleManage}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                  Gestionar suscripción
                </button>
              )}
            </div>

            {status.subscription?.current_period_end && (
              <p className="text-xs text-slate-400">
                Próxima renovación:{' '}
                {new Date(status.subscription.current_period_end).toLocaleDateString('es', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}

            <div className="border-t border-slate-100 pt-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uso del plan</p>
              <UsageBar
                used={status.usage.patients}
                max={status.limits.max_patients}
                label="Pacientes activos"
              />
              <UsageBar
                used={status.usage.staff}
                max={status.limits.max_staff}
                label="Miembros del equipo"
              />
            </div>
          </div>

          {/* Plan comparison */}
          {status.plan === 'free' && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-blue-600" />
                <p className="font-semibold text-blue-900">¿Qué incluye el plan Pro?</p>
              </div>
              <ul className="space-y-2 text-sm text-blue-800">
                {[
                  'Hasta 2,000 pacientes activos',
                  'Hasta 20 miembros del equipo',
                  'Exportación FHIR R4',
                  'Asistente IA para consultas',
                  'Soporte prioritario',
                ].map(feature => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="shrink-0 text-blue-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleUpgrade}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Actualizar ahora
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
