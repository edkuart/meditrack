'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Stethoscope } from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getHistory, isUnauthorizedPortalError } from '@/lib/portal/api'

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
    if (!session) { router.replace('/portal'); return }

    getHistory(session.token)
      .then(setHistory)
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
          <h1 className="text-xl font-semibold text-slate-900">Mis consultas</h1>
          <p className="text-sm text-slate-400">Resumen de visitas compartidas</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {history.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
              <CalendarDays size={26} />
            </div>
            <p className="font-medium text-slate-700">No hay consultas registradas</p>
            <p className="mt-1 text-sm">Cuando tu equipo médico comparta consultas, aparecerán aquí.</p>
          </div>
        ) : (
          history.map(enc => (
            <div key={enc.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                  <Stethoscope size={16} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
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

                  <p className="mt-1 text-xs text-slate-400">
                    Dr. {enc.doctor.first_name} {enc.doctor.last_name}
                    {enc.doctor.specialty && ` · ${enc.doctor.specialty}`}
                  </p>

                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <CalendarDays size={12} />
                    {new Date(enc.opened_at).toLocaleDateString('es', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>

                  {enc.chief_complaint && (
                    <p className="text-slate-600 text-sm mt-2 leading-snug">{enc.chief_complaint}</p>
                  )}

                  {enc.summary && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-medium text-slate-500">Resumen</p>
                      <p className="text-sm leading-relaxed text-slate-600">{enc.summary}</p>
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
