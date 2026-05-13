'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Clock, Info, Pill, ShieldCheck } from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getActiveTreatments, isUnauthorizedPortalError, type TreatmentPlan } from '@/lib/portal/api'

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Diario',
  EVERY_X_HOURS: 'Cada X horas',
  WEEKLY: 'Semanal',
  AS_NEEDED: 'Cuando sea necesario',
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function TreatmentPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal'); return }

    getActiveTreatments(session.token)
      .then(setPlans)
      .catch((err) => {
        if (isUnauthorizedPortalError(err)) {
          clearSession()
          router.replace('/portal')
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-md pb-10">

      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        <Link href="/portal" className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <ArrowLeft size={18} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mi tratamiento</h1>
          <p className="text-sm text-slate-400">Indicaciones activas de tu equipo médico</p>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="px-5 py-16 text-center text-slate-400">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
            <ShieldCheck size={26} />
          </div>
          <p className="font-medium text-slate-700">No tienes un tratamiento activo</p>
          <p className="mt-1 text-sm">Tu médico te asignará uno cuando corresponda</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-medium text-blue-600">
              {plans.length === 1 ? '1 tratamiento activo' : `${plans.length} tratamientos activos`}
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-700">
              Sigue las indicaciones como fueron entregadas. Si tienes dudas o notas algo diferente, consulta con tu equipo médico.
            </p>
          </div>

          {plans.map(plan => (
            <section key={plan.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <ShieldCheck size={13} />
                  Activo
                </div>
                <p className="text-lg font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                  <CalendarDays size={14} />
                  {formatDate(plan.start_date)}
                  {plan.end_date && <> - {formatDate(plan.end_date)}</>}
                </p>
                {plan.instructions && (
                  <div className="mt-4 flex gap-2 rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-blue-700">
                    <Info size={15} className="mt-0.5 shrink-0" />
                    <p>{plan.instructions}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col divide-y divide-slate-100">
                {plan.medications.map(med => (
                <div key={med.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                      <Pill size={18} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-900">{med.drug_name}</p>
                      {med.presentation && (
                        <p className="text-sm text-slate-400">{med.presentation}</p>
                      )}
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="font-medium">{med.dose_amount} {med.dose_unit}</span>
                        {' · '}
                        {FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                      </p>
                      {med.times_per_day && med.times_per_day.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {med.times_per_day.map(time => (
                            <span key={time} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                              <Clock size={12} />
                              {time}
                            </span>
                          ))}
                        </div>
                      )}
                      {med.with_food && (
                        <p className="mt-2 text-sm text-amber-600">Tomar con comida</p>
                      )}
                      {med.special_instructions && (
                        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">{med.special_instructions}</p>
                      )}
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
