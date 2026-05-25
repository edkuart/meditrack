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
    <div style={{
      position: 'relative',
      borderRadius: 12,
      border: '1px solid var(--mt-primary-mist)',
      background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, var(--mt-purple-subtle) 100%)',
      padding: 20,
    }}>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 28, height: 28, borderRadius: 6,
          border: 'none', background: 'rgba(255,255,255,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--mt-text-2)', cursor: 'pointer',
          transition: 'background .15s',
        }}
      >
        <X size={14} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 24 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-primary-deep)', margin: 0 }}>
            Configura tu clínica
          </p>
          <p style={{ fontSize: 12, color: 'var(--mt-primary)', marginTop: 2, marginBottom: 0 }}>
            {status.completed_count} de {status.total_count} pasos completados
          </p>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6, width: '100%', borderRadius: 999,
          background: 'var(--mt-primary-mist)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 999,
            background: 'var(--mt-gradient-accent)',
            transition: 'width .6s cubic-bezier(0,0,.2,1)',
          }} />
        </div>

        {/* Step chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  borderRadius: 999, padding: '3px 10px',
                  fontSize: 12, fontWeight: 500,
                  background: done ? 'var(--mt-primary-mist)' : '#fff',
                  color: done ? 'var(--mt-primary-deep)' : 'var(--mt-text-2)',
                  border: done ? '1px solid var(--mt-primary-mist)' : '1px solid var(--mt-border)',
                  textDecoration: done ? 'line-through' : 'none',
                  opacity: done ? 0.65 : 1,
                }}
              >
                {done && <CheckCircle2 size={10} />}
                {step.label}
              </span>
            )
          })}
        </div>

        <Link
          href="/onboarding"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            borderRadius: 8, padding: '7px 14px',
            background: 'var(--mt-gradient-primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', width: 'fit-content',
            boxShadow: '0 1px 3px rgba(37,99,235,.25)',
            transition: 'opacity .15s',
          }}
        >
          Completar configuración
          <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  )
}
