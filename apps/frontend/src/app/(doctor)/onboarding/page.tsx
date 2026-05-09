'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Loader2,
  Stethoscope,
  Users,
  Activity,
  ClipboardList,
  UserCog,
  PartyPopper,
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
    key: 'has_patient',
    icon: Users,
    title: 'Agrega tu primer paciente',
    description: 'Crea el expediente del primer paciente de tu clínica con sus datos básicos.',
    action: 'Agregar paciente',
    href: '/patients/new',
    required: true,
  },
  {
    key: 'has_encounter',
    icon: Stethoscope,
    title: 'Abre una consulta clínica',
    description: 'Registra la primera consulta de un paciente para documentar el motivo y tus notas clínicas.',
    action: 'Ver pacientes',
    href: '/patients',
    required: true,
  },
  {
    key: 'has_treatment',
    icon: ClipboardList,
    title: 'Prescribe un plan de tratamiento',
    description: 'Crea un plan con medicamentos, dosis y frecuencia para que el paciente haga seguimiento desde el portal.',
    action: 'Ver pacientes',
    href: '/patients',
    required: true,
  },
  {
    key: 'has_staff',
    icon: UserCog,
    title: 'Invita a tu equipo',
    description: 'Añade enfermeras, asistentes o médicos colaboradores para que accedan a la plataforma.',
    action: 'Gestionar equipo',
    href: '/staff',
    required: false,
  },
  {
    key: 'has_billing',
    icon: CreditCard,
    title: 'Configura tu suscripción',
    description: 'Actualiza al plan Pro para desbloquear más pacientes, equipo y funciones avanzadas.',
    action: 'Ver planes',
    href: '/settings/billing',
    required: false,
  },
]

function StepCard({ step, done, index }: { step: Step; done: boolean; index: number }) {
  const Icon = step.icon

  return (
    <div className={`flex gap-4 rounded-2xl border p-5 transition-colors ${
      done
        ? 'border-emerald-100 bg-emerald-50/50 opacity-70'
        : 'border-slate-200 bg-white hover:border-blue-100 hover:bg-blue-50/30'
    }`}>
      {/* Step number / checkmark */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
        done
          ? 'bg-emerald-100 text-emerald-600'
          : 'bg-blue-50 text-blue-600'
      }`}>
        {done ? <CheckCircle2 size={18} /> : index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold ${done ? 'text-emerald-700 line-through' : 'text-slate-900'}`}>
            {step.title}
          </p>
          {!step.required && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Opcional</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">{step.description}</p>

        {!done && (
          <Link
            href={step.href}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
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
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const requiredDone = status
    ? STEPS.filter(s => s.required).every(s => status.steps[s.key])
    : false

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
          <Activity size={15} />
          Configuración inicial
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Configura tu clínica</h1>
        <p className="text-slate-500 text-sm">
          Completa estos pasos para empezar a usar meditrack con tus pacientes.
        </p>
      </div>

      {/* Progress */}
      {status && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Progreso general</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {status.completed_count}/{status.total_count}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                requiredDone ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.round((status.completed_count / status.total_count) * 100)}%` }}
            />
          </div>
          {requiredDone && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <PartyPopper size={15} />
              ¡Los pasos esenciales están completos! Ya puedes usar meditrack al 100%.
            </div>
          )}
        </div>
      )}

      {/* Steps */}
      {status && (
        <div className="space-y-3">
          {STEPS.map((step, i) => (
            <StepCard
              key={step.key}
              step={step}
              done={status.steps[step.key]}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Back to dashboard */}
      <div className="pt-2">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Volver al panel
        </button>
      </div>
    </div>
  )
}
