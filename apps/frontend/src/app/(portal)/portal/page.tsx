'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight,
  ClipboardList,
  FileText,
  HeartPulse,
  LogOut,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import { PatientAvatar } from '@/components/portal/PatientAvatar'
import { DoseCard } from '@/components/portal/DoseCard'
import { getSession, saveSession, clearSession, type PatientSession } from '@/lib/portal/session'
import {
  authMagicLink,
  confirmDose,
  getAdherence,
  getEngagement,
  getTodayDoses,
  type DoseEvent,
  type PatientEngagement,
} from '@/lib/portal/api'

type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function engagementCopy(score?: number) {
  if (score === undefined) return 'Revisa con calma lo que tienes programado para hoy.'
  if (score >= 85) return 'Vas muy bien. Mantén tu ritmo de hoy.'
  if (score >= 60) return 'Cada confirmación ayuda a mantener tu tratamiento ordenado.'
  return 'Un paso a la vez. Empieza por la próxima dosis programada.'
}

function PortalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [session, setSession] = useState<PatientSession | null>(null)
  const [doses, setDoses] = useState<DoseEvent[]>([])
  const [adherence, setAdherence] = useState<{ score: number; avatar_state: AvatarState } | null>(null)
  const [engagement, setEngagement] = useState<PatientEngagement | null>(null)
  const [caregiverMode, setCaregiverMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Authenticate via magic link token from URL or existing session
  useEffect(() => {
    async function init() {
      const urlToken = searchParams.get('token')

      try {
        if (urlToken) {
          // Validate magic link
          const result = await authMagicLink(urlToken)
          const s: PatientSession = { token: result.session_token, patient: result.patient }
          saveSession(s)
          setSession(s)
          // Clean token from URL without full reload
          window.history.replaceState({}, '', '/portal')
        } else {
          const existing = getSession()
          if (!existing) {
            router.replace('/portal/auth')
            return
          }
          setSession(existing)
        }
      } catch (err) {
        setError('El enlace es inválido o ya expiró. Pide a tu médico un nuevo acceso.')
        setLoading(false)
        return
      }
    }
    init()
  }, [searchParams, router])

  // Load portal data once session is ready
  const loadData = useCallback(async (token: string) => {
    try {
      const [dosesData, adherenceData, engagementData] = await Promise.all([
        getTodayDoses(token),
        getAdherence(token),
        getEngagement(token),
      ])
      setDoses(dosesData)
      setAdherence(adherenceData)
      setEngagement(engagementData)
    } catch {
      setError('No se pudo cargar tu información. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) loadData(session.token)
  }, [session, loadData])

  async function handleConfirm(doseId: string) {
    if (!session) return
    const updated = await confirmDose(session.token, doseId)
    setDoses(prev => prev.map(d => d.id === doseId ? { ...d, ...updated } : d))
    // Refresh calm feedback after confirmation.
    getAdherence(session.token).then(setAdherence).catch(() => {})
    getEngagement(session.token).then(setEngagement).catch(() => {})
  }

  function handleLogout() {
    clearSession()
    router.replace('/portal/auth')
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <p className="text-5xl mb-4">⚠️</p>
          <p className="text-slate-700 text-lg font-medium mb-2">Acceso no válido</p>
          <p className="text-slate-500 text-base">{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Cargando tu tratamiento...</p>
        </div>
      </div>
    )
  }

  const firstName = session?.patient.first_name ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const confirmedToday = doses.filter(d => d.status === 'CONFIRMED').length
  const totalToday = doses.filter(d => d.status !== 'CANCELLED').length
  const pendingDoses = doses.filter(d => d.status === 'PENDING')
  const nextDose = pendingDoses.find(d => new Date(d.can_edit_until) >= new Date())
  const progressPct = totalToday > 0 ? Math.round((confirmedToday / totalToday) * 100) : 0
  const allDone = totalToday > 0 && confirmedToday === totalToday

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col pb-8">

      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <div>
          <p className="text-sm text-slate-400">{greeting}</p>
          <p className="text-xl font-semibold text-slate-900">{firstName}</p>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm"
        >
          <LogOut size={16} />
        </button>
      </div>

      <section className="mx-5 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          {adherence && (
            <div className="shrink-0 scale-75 origin-top-left">
              <PatientAvatar state={adherence.avatar_state} score={adherence.score} />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <HeartPulse size={13} />
                Seguimiento semanal
              </div>
              <button
                type="button"
                onClick={() => setCaregiverMode(prev => !prev)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500"
              >
                {caregiverMode ? 'Vista paciente' : 'Vista cuidador'}
              </button>
            </div>
            <p className="text-lg font-semibold leading-snug text-slate-900">
              {engagement?.headline ?? engagementCopy(adherence?.score)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {caregiverMode && engagement
                ? engagement.caregiver_tip
                : engagement?.guidance ?? (
                    nextDose
                      ? `Próxima dosis: ${nextDose.medication_item.drug_name} a las ${formatTime(nextDose.scheduled_at)}.`
                      : allDone
                        ? 'Ya registraste todas las dosis de hoy.'
                        : 'No hay dosis pendientes en este momento.'
                  )}
            </p>
          </div>
        </div>
      </section>

      {engagement && (
        <section className="mx-5 mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{engagement.next_action.label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{engagement.next_action.detail}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-emerald-700">{engagement.streak_days}</p>
              <p className="text-[11px] font-medium text-emerald-700">días</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Progreso de los últimos siete días">
            {engagement.week.map(day => (
              <div
                key={day.date}
                title={`${day.date}: ${day.total > 0 ? `${day.score}%` : 'sin dosis'}`}
                className={`h-9 rounded-xl border ${
                  day.total === 0 ? 'border-slate-100 bg-slate-50' :
                  day.score >= 80 ? 'border-emerald-100 bg-emerald-100' :
                  day.score >= 40 ? 'border-amber-100 bg-amber-100' :
                  'border-rose-100 bg-rose-100'
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            {engagement.weekly_completed_days} día(s) completos esta semana. El objetivo es ayudarte a recordar, no exigirte perfección.
          </p>
        </section>
      )}

      <section className="mt-5 px-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">Hoy</p>
            <p className="text-sm text-slate-400">
              {totalToday > 0 ? `${confirmedToday} de ${totalToday} registradas` : 'Sin dosis programadas'}
            </p>
          </div>
          {totalToday > 0 && (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
              {progressPct}%
            </div>
          )}
        </div>

        {totalToday > 0 && (
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="flex flex-col gap-3" aria-live="polite">
          {doses.length === 0 ? (
            <div className="rounded-3xl border border-slate-100 bg-white px-6 py-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <ShieldCheck size={24} />
              </div>
              <p className="font-medium text-slate-700">No hay dosis programadas para hoy</p>
              <p className="mt-1 text-sm text-slate-400">Puedes revisar tu tratamiento completo si tienes dudas.</p>
            </div>
          ) : (
            doses.map(dose => (
              <DoseCard key={dose.id} dose={dose} onConfirm={handleConfirm} />
            ))
          )}
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-2 px-5 pt-6">
        <Link
          href="/portal/treatment"
          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
        >
          <span className="flex items-center gap-3 font-medium text-slate-700">
            <ClipboardList size={18} className="text-blue-500" />
            Ver mi tratamiento completo
          </span>
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
        <Link
          href="/portal/history"
          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
        >
          <span className="flex items-center gap-3 font-medium text-slate-700">
            <Stethoscope size={18} className="text-blue-500" />
            Mis consultas anteriores
          </span>
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
        <Link
          href="/portal/documents"
          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
        >
          <span className="flex items-center gap-3 font-medium text-slate-700">
            <FileText size={18} className="text-blue-500" />
            Mis documentos
          </span>
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
        <p className="pt-3 text-center text-xs leading-5 text-slate-400">
          Si algo no coincide con las indicaciones recibidas, consulta con tu equipo médico.
        </p>
      </div>

    </div>
  )
}

export default function PortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <PortalContent />
    </Suspense>
  )
}
