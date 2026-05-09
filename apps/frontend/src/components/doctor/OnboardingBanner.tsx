'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, X } from 'lucide-react'
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/doctor/onboarding-api'
import { useAuth } from '@/lib/doctor/auth-context'

const DISMISSED_KEY = 'onboarding_banner_dismissed'

export function OnboardingBanner() {
  const { token } = useAuth()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === 'true') {
      setDismissed(true)
      return
    }
    if (!token) return
    getOnboardingStatus(token)
      .then(s => { if (!s.completed) setStatus(s) })
      .catch(() => {})
  }, [token])

  if (dismissed || !status || status.completed) return null

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  const pct = Math.round((status.completed_count / status.total_count) * 100)

  return (
    <div className="relative rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors"
        aria-label="Cerrar"
      >
        <X size={16} />
      </button>

      <div className="flex flex-col gap-3 pr-6">
        <div>
          <p className="text-sm font-semibold text-blue-800">Configura tu clínica</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {status.completed_count} de {status.total_count} pasos completados
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Quick step indicators */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'has_patient', label: 'Paciente' },
            { key: 'has_encounter', label: 'Consulta' },
            { key: 'has_treatment', label: 'Tratamiento' },
            { key: 'has_staff', label: 'Equipo' },
            { key: 'has_billing', label: 'Plan' },
          ].map(step => {
            const done = status.steps[step.key as keyof typeof status.steps]
            return (
              <span
                key={step.key}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  done
                    ? 'bg-blue-100 text-blue-700 line-through opacity-60'
                    : 'bg-white border border-blue-100 text-slate-600'
                }`}
              >
                {done && <CheckCircle2 size={10} />}
                {step.label}
              </span>
            )
          })}
        </div>

        <Link
          href="/onboarding"
          className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Completar configuración
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  )
}
