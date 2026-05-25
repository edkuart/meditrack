'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Loader2, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getSessions, revokeSession, revokeAllSessions, type Session } from '@/lib/doctor/settings-api'
import { MTButton } from '@/components/doctor/clinical-ui'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Justo ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  return `Hace ${Math.floor(hours / 24)}d`
}

function SessionRow({ session, onRevoke, revoking }: {
  session: Session; onRevoke: (id: string) => void; revoking: boolean
}) {
  const lastActive = session.used_at ?? session.created_at
  const isExpired = new Date(session.expires_at) < new Date()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 20px',
      borderBottom: '1px solid var(--mt-border)',
    }}>
      <div style={{
        width: 40, height: 40, flexShrink: 0, borderRadius: 10,
        background: 'var(--mt-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Monitor size={18} color="var(--mt-muted)" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.device_hint ?? 'Dispositivo desconocido'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '3px 0 0' }}>
          Último uso: {timeAgo(lastActive)}
          {' · '}
          {isExpired
            ? 'Expirada'
            : `Expira ${new Date(session.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
        </p>
      </div>

      {!isExpired && (
        <MTButton
          variant="outline" size="sm"
          icon={revoking ? Loader2 : LogOut}
          disabled={revoking}
          onClick={() => onRevoke(session.id)}
          style={{ color: 'var(--mt-danger)', borderColor: 'var(--mt-danger-subtle)' }}
        >
          Revocar
        </MTButton>
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
    getSessions(token).then(setSessions).catch(() => {}).finally(() => setLoading(false))
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
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Monitor size={22} color="var(--mt-muted)" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Sesiones activas</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Dispositivos con acceso activo a tu cuenta.</p>
        </div>
      </div>

      {feedback && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderRadius: 10, fontSize: 13,
          background: feedback.ok ? 'var(--mt-success-subtle)' : 'var(--mt-danger-subtle)',
          color: feedback.ok ? '#065F46' : 'var(--mt-danger)',
          border: `1px solid ${feedback.ok ? '#6EE7B7' : '#fecaca'}`,
        }}>
          {feedback.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {feedback.msg}
        </div>
      )}

      <div style={{ borderRadius: 16, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>
            No hay sesiones activas.
          </div>
        ) : (
          sessions.map((session, i) => (
            <div key={session.id} style={i === sessions.length - 1 ? { borderBottom: 'none' } : {}}>
              <SessionRow session={session} onRevoke={handleRevoke} revoking={revokingId === session.id} />
            </div>
          ))
        )}
      </div>

      {sessions.length > 0 && (
        <div style={{
          borderRadius: 14, border: '1px solid #fecaca',
          background: 'var(--mt-danger-subtle)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertTriangle size={16} color="var(--mt-danger)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#7f1d1d', margin: 0 }}>Cerrar todas las sesiones</p>
              <p style={{ fontSize: 12, color: 'var(--mt-danger)', margin: '4px 0 0' }}>
                Se cerrará sesión en todos los dispositivos incluido este. Necesitarás volver a iniciar sesión.
              </p>
            </div>
          </div>

          {!confirmAll ? (
            <MTButton variant="outline" onClick={() => setConfirmAll(true)}
              style={{ color: 'var(--mt-danger)', borderColor: '#fecaca', width: 'fit-content' }}>
              Cerrar todas las sesiones
            </MTButton>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <MTButton variant="danger" icon={revokingAll ? Loader2 : undefined} disabled={revokingAll} onClick={handleRevokeAll}>
                Confirmar
              </MTButton>
              <MTButton variant="outline" onClick={() => setConfirmAll(false)}>
                Cancelar
              </MTButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
