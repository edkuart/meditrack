'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ChevronRight, CreditCard, Loader2,
  Stethoscope, Users, Activity, ClipboardList, UserCog, PartyPopper,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getOnboardingStatus, type OnboardingStatus } from '@/lib/doctor/onboarding-api'

interface Step {
  key: keyof OnboardingStatus['steps']
  icon: typeof Stethoscope
  title: string
  description: string
  action: string
  href: string
  required: boolean
}

const STEPS: Step[] = [
  {
    key: 'has_patient', icon: Users,
    title: 'Agrega tu primer paciente',
    description: 'Crea el expediente del primer paciente de tu clínica con sus datos básicos.',
    action: 'Agregar paciente', href: '/patients/new', required: true,
  },
  {
    key: 'has_encounter', icon: Stethoscope,
    title: 'Abre una consulta clínica',
    description: 'Registra la primera consulta de un paciente para documentar el motivo y tus notas clínicas.',
    action: 'Ver pacientes', href: '/patients', required: true,
  },
  {
    key: 'has_treatment', icon: ClipboardList,
    title: 'Prescribe un plan de tratamiento',
    description: 'Crea un plan con medicamentos, dosis y frecuencia para que el paciente haga seguimiento desde el portal.',
    action: 'Ver pacientes', href: '/patients', required: true,
  },
  {
    key: 'has_staff', icon: UserCog,
    title: 'Invita a tu equipo',
    description: 'Añade enfermeras, asistentes o médicos colaboradores para que accedan a la plataforma.',
    action: 'Gestionar equipo', href: '/staff', required: false,
  },
  {
    key: 'has_billing', icon: CreditCard,
    title: 'Configura tu suscripción',
    description: 'Actualiza al plan Pro para desbloquear más pacientes, equipo y funciones avanzadas.',
    action: 'Ver planes', href: '/settings/billing', required: false,
  },
]

function StepCard({ step, done, index }: { step: Step; done: boolean; index: number }) {
  const Icon = step.icon
  return (
    <div style={{
      display: 'flex', gap: 16, borderRadius: 16, padding: 20,
      border: `1px solid ${done ? 'var(--mt-success-subtle)' : 'var(--mt-border)'}`,
      background: done ? 'var(--mt-success-subtle)' : 'var(--mt-surface)',
      opacity: done ? 0.7 : 1,
      transition: 'border-color .2s, background .2s',
    }}>
      <div style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700,
        background: done ? 'rgba(16,185,129,.15)' : 'var(--mt-primary-subtle)',
        color: done ? 'var(--mt-success)' : 'var(--mt-primary)',
      }}>
        {done ? <CheckCircle2 size={18} /> : index + 1}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{
            fontWeight: 600, margin: 0, fontSize: 14,
            color: done ? 'var(--mt-success)' : 'var(--mt-text)',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {step.title}
          </p>
          {!step.required && (
            <span style={{
              borderRadius: 999, background: 'var(--mt-elevated)',
              padding: '2px 8px', fontSize: 11, color: 'var(--mt-muted)',
            }}>Opcional</span>
          )}
        </div>
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--mt-text-2)', marginBottom: done ? 0 : 12 }}>
          {step.description}
        </p>
        {!done && (
          <Link href={step.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            borderRadius: 8, padding: '6px 14px',
            background: 'var(--mt-gradient-primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(37,99,235,.25)',
          }}>
            <Icon size={13} />
            {step.action}
            <ChevronRight size={13} />
          </Link>
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    getOnboardingStatus(token)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const requiredDone = status
    ? STEPS.filter(s => s.required).every(s => status.steps[s.key])
    : false

  const pct = status ? Math.round((status.completed_count / status.total_count) * 100) : 0

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--mt-purple)', fontWeight: 500 }}>
          <Activity size={15} />
          Configuración inicial
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>
          Configura tu clínica
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mt-text-2)', margin: 0 }}>
          Completa estos pasos para empezar a usar meditrack con tus pacientes.
        </p>
      </div>

      {status && (
        <div style={{
          borderRadius: 16, border: '1px solid var(--mt-border)',
          background: 'var(--mt-surface)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 500, color: 'var(--mt-text-2)' }}>Progreso general</span>
            <span style={{ fontWeight: 700, color: 'var(--mt-text)', fontVariantNumeric: 'tabular-nums' }}>
              {status.completed_count}/{status.total_count}
            </span>
          </div>
          <div style={{ height: 8, width: '100%', borderRadius: 999, background: 'var(--mt-elevated)', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 999,
              background: requiredDone ? '#34D399' : 'var(--mt-gradient-accent)',
              transition: 'width .6s cubic-bezier(0,0,.2,1)',
            }} />
          </div>
          {requiredDone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mt-success)', fontWeight: 500 }}>
              <PartyPopper size={15} />
              ¡Los pasos esenciales están completos! Ya puedes usar meditrack al 100%.
            </div>
          )}
        </div>
      )}

      {status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map((step, i) => (
            <StepCard key={step.key} step={step} done={status.steps[step.key]} index={i} />
          ))}
        </div>
      )}

      <div style={{ paddingTop: 8 }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{ fontSize: 13, color: 'var(--mt-muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color .15s' }}
        >
          ← Volver al panel
        </button>
      </div>
    </div>
  )
}
