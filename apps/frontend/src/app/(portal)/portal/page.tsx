'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LogOut, ChevronRight } from 'lucide-react'
import { PatientAvatar } from '@/components/portal/PatientAvatar'
import { DoseCard } from '@/components/portal/DoseCard'
import { getSession, saveSession, clearSession, type PatientSession } from '@/lib/portal/session'
import { authMagicLink, getTodayDoses, getAdherence, confirmDose, type DoseEvent } from '@/lib/portal/api'

type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export default function PortalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [session, setSession] = useState<PatientSession | null>(null)
  const [doses, setDoses] = useState<DoseEvent[]>([])
  const [adherence, setAdherence] = useState<{ score: number; avatar_state: AvatarState } | null>(null)
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
      const [dosesData, adherenceData] = await Promise.all([
        getTodayDoses(token),
        getAdherence(token),
      ])
      setDoses(dosesData)
      setAdherence(adherenceData)
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
    // Refresh adherence score
    getAdherence(session.token).then(setAdherence).catch(() => {})
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

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-8">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <div>
          <p className="text-slate-400 text-sm">{greeting}</p>
          <p className="text-slate-800 text-xl font-semibold">{firstName} 👋</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Avatar + score */}
      {adherence && (
        <div className="mx-5 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center gap-2">
          <PatientAvatar state={adherence.avatar_state} score={adherence.score} />
          <p className="text-slate-400 text-sm">adherencia últimos 7 días</p>
        </div>
      )}

      {/* Today summary */}
      <div className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-700 font-semibold text-lg">Hoy</p>
          <p className="text-slate-400 text-sm">{confirmedToday} de {totalToday} tomadas</p>
        </div>

        {/* Dose progress bar */}
        {totalToday > 0 && (
          <div className="w-full h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-500"
              style={{ width: `${totalToday > 0 ? (confirmedToday / totalToday) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Dose cards */}
        <div className="flex flex-col gap-3">
          {doses.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🎉</p>
              <p className="font-medium text-slate-600">No hay dosis programadas para hoy</p>
            </div>
          ) : (
            doses.map(dose => (
              <DoseCard key={dose.id} dose={dose} onConfirm={handleConfirm} />
            ))
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="mt-auto px-5 pt-6 flex flex-col gap-2">
        <Link
          href="/portal/treatment"
          className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 border border-slate-100 shadow-sm"
        >
          <span className="text-slate-700 font-medium">Ver mi tratamiento completo</span>
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
        <Link
          href="/portal/history"
          className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 border border-slate-100 shadow-sm"
        >
          <span className="text-slate-700 font-medium">Mis consultas anteriores</span>
          <ChevronRight size={18} className="text-slate-400" />
        </Link>
      </div>

    </div>
  )
}
