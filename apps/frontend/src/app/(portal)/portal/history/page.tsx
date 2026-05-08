'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Stethoscope } from 'lucide-react'
import { getSession } from '@/lib/portal/session'
import { getHistory } from '@/lib/portal/api'

type Encounter = Awaited<ReturnType<typeof getHistory>>[number]

const TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP: 'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización',
  DISCHARGE: 'Alta médica',
  CHRONIC_CONTROL: 'Control crónico',
  EMERGENCY: 'Emergencia',
}

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal/auth'); return }

    getHistory(session.token)
      .then(setHistory)
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
        <h1 className="text-slate-800 text-xl font-semibold">Mis consultas</h1>
      </div>

      <div className="px-5 flex flex-col gap-3">
        {history.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">📅</p>
            <p className="text-slate-600 font-medium">No hay consultas registradas</p>
          </div>
        ) : (
          history.map(enc => (
            <div key={enc.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Stethoscope size={16} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 text-sm">
                      {TYPE_LABELS[enc.encounter_type] ?? enc.encounter_type}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      enc.status === 'CLOSED'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {enc.status === 'CLOSED' ? 'Cerrada' : 'Abierta'}
                    </span>
                  </div>

                  <p className="text-slate-400 text-xs mt-1">
                    Dr. {enc.doctor.first_name} {enc.doctor.last_name}
                    {enc.doctor.specialty && ` · ${enc.doctor.specialty}`}
                  </p>

                  <p className="text-slate-400 text-xs mt-1">
                    {new Date(enc.opened_at).toLocaleDateString('es', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>

                  {enc.chief_complaint && (
                    <p className="text-slate-600 text-sm mt-2 leading-snug">{enc.chief_complaint}</p>
                  )}

                  {enc.summary && (
                    <div className="mt-2 bg-slate-50 rounded-xl p-3">
                      <p className="text-slate-500 text-xs font-medium mb-1">Resumen</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{enc.summary}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
