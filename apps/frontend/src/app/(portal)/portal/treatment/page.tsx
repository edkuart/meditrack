'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pill, Clock, Info } from 'lucide-react'
import { getSession } from '@/lib/portal/session'
import { getActiveTreatment, type TreatmentPlan } from '@/lib/portal/api'

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Diario',
  EVERY_X_HOURS: 'Cada X horas',
  WEEKLY: 'Semanal',
  AS_NEEDED: 'Cuando sea necesario',
}

export default function TreatmentPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<TreatmentPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal/auth'); return }

    getActiveTreatment(session.token)
      .then(setPlan)
      .catch(() => {})
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
    <div className="max-w-md mx-auto min-h-screen pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Link href="/portal" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </Link>
        <h1 className="text-slate-800 text-xl font-semibold">Mi tratamiento</h1>
      </div>

      {!plan ? (
        <div className="text-center px-5 py-16 text-slate-400">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-slate-600 font-medium">No tienes un tratamiento activo</p>
          <p className="text-sm mt-1">Tu médico te asignará uno en tu próxima consulta</p>
        </div>
      ) : (
        <div className="px-5 flex flex-col gap-4">

          {/* Plan header */}
          <div className="bg-blue-50 rounded-3xl p-5 border border-blue-100">
            <p className="text-blue-800 font-semibold text-lg">{plan.name}</p>
            <p className="text-blue-500 text-sm mt-1">
              {new Date(plan.start_date).toLocaleDateString('es', { day: 'numeric', month: 'long' })}
              {plan.end_date && (
                <> — {new Date(plan.end_date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</>
              )}
            </p>
            {plan.instructions && (
              <div className="flex gap-2 mt-3 text-blue-600 text-sm">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>{plan.instructions}</p>
              </div>
            )}
          </div>

          {/* Medications */}
          <p className="text-slate-500 text-sm font-medium px-1">Medicamentos</p>

          {plan.medications.map((med, i) => (
            <div key={med.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Pill size={18} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-base">{med.drug_name}</p>
                  {med.presentation && (
                    <p className="text-slate-400 text-sm">{med.presentation}</p>
                  )}
                  <p className="text-slate-600 mt-2 text-sm">
                    <span className="font-medium">{med.dose_amount} {med.dose_unit}</span>
                    {' · '}
                    {FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                  </p>
                  {med.times_per_day && med.times_per_day.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-slate-400 text-sm">
                      <Clock size={12} />
                      {med.times_per_day.join(' · ')}
                    </div>
                  )}
                  {med.with_food && (
                    <p className="text-amber-500 text-sm mt-1">🍽 Tomar con comida</p>
                  )}
                  {med.special_instructions && (
                    <p className="text-slate-400 text-sm mt-2 italic">{med.special_instructions}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
