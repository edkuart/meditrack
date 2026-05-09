'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Loader2, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getSessions,
  revokeSession,
  revokeAllSessions,
  type Session,
} from '@/lib/doctor/settings-api'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Justo ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  return `Hace ${Math.floor(hours / 24)}d`
}

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: Session
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  const lastActive = session.used_at ?? session.created_at
  const expiresAt = new Date(session.expires_at)
  const isExpired = expiresAt < new Date()

  return (
    <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
        <Monitor size={18} className="text-slate-500" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {session.device_hint ?? 'Dispositivo desconocido'}
        </p>
        <p className="text-xs text-slate-400">
          Último uso: {timeAgo(lastActive)}
          {' · '}
          {isExpired
            ? 'Expirada'
            : `Expira ${new Date(session.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
        </p>
      </div>

      {!isExpired && (
        <button
          onClick={() => onRevoke(session.id)}
          disabled={revoking}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          {revoking ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
          Revocar
        </button>
      )}
    </div>
  )
}

export default function SessionsPage() {
  const { token, logout } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => {
    if (!token) return
    getSessions(token)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  async function handleRevoke(id: string) {
    if (!token) return
    setRevokingId(id)
    try {
      await revokeSession(token, id)
      setSessions(s => s.filter(x => x.id !== id))
      setFeedback({ ok: true, msg: 'Sesión revocada.' })
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error.' })
    } finally {
      setRevokingId(null)
    }
  }

  async function handleRevokeAll() {
    if (!token) return
    setRevokingAll(true)
    try {
      const { revoked } = await revokeAllSessions(token)
      setFeedback({ ok: true, msg: `${revoked} sesión(es) cerrada(s). Redirigiendo…` })
      setTimeout(() => { logout(); router.replace('/login') }, 1500)
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error.' })
      setRevokingAll(false)
    }
    setConfirmAll(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Monitor size={22} className="text-slate-400" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sesiones activas</h1>
          <p className="text-sm text-slate-500">
            Dispositivos con acceso activo a tu cuenta.
          </p>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm border ${
          feedback.ok
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-600 border-red-200'
        }`}>
          {feedback.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {feedback.msg}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {sessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No hay sesiones activas.
          </div>
        ) : (
          sessions.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={revokingId === session.id}
            />
          ))
        )}
      </div>

      {sessions.length > 0 && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Cerrar todas las sesiones</p>
              <p className="text-xs text-red-600 mt-0.5">
                Se cerrará sesión en todos los dispositivos incluido este. Necesitarás volver a iniciar sesión.
              </p>
            </div>
          </div>

          {!confirmAll ? (
            <button
              onClick={() => setConfirmAll(true)}
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Cerrar todas las sesiones
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleRevokeAll}
                disabled={revokingAll}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {revokingAll && <Loader2 size={13} className="animate-spin" />}
                Confirmar
              </button>
              <button
                onClick={() => setConfirmAll(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
