'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
} from 'lucide-react'
import { MTLogo } from '@/components/doctor/clinical-ui'
import { getSession, clearSession } from '@/lib/portal/session'
import {
  getPortalAppointments,
  confirmAppointmentAttendance,
  isUnauthorizedPortalError,
  type PortalAppointment,
} from '@/lib/portal/api'

const APPT_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP: 'Control',
  PROCEDURE: 'Procedimiento',
  CHECK_UP: 'Chequeo',
  EMERGENCY: 'Urgencia',
  TELECONSULT: 'Teleconsulta',
}

const APPT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SCHEDULED:   { label: 'Agendada',   color: 'var(--mt-primary)', bg: 'var(--mt-primary-subtle)' },
  CONFIRMED:   { label: 'Confirmada', color: '#047857',            bg: 'var(--mt-success-subtle)' },
  IN_PROGRESS: { label: 'En curso',   color: '#B45309',            bg: '#FFFBEB' },
  COMPLETED:   { label: 'Completada', color: '#374151',            bg: 'var(--mt-elevated)' },
  CANCELLED:   { label: 'Cancelada',  color: '#9CA3AF',            bg: 'var(--mt-elevated)' },
  NO_SHOW:     { label: 'No asistí',  color: '#9CA3AF',            bg: 'var(--mt-elevated)' },
}

function formatApptDate(isoString: string) {
  const date = new Date(isoString)
  const now = new Date()
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const isToday = toDay(date) === toDay(now)
  const isTomorrow = toDay(date) === toDay(now) + 86400000
  let day: string
  if (isToday) day = 'Hoy'
  else if (isTomorrow) day = 'Mañana'
  else {
    day = date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
    day = day.charAt(0).toUpperCase() + day.slice(1)
  }
  return { label: `${day} · ${time}`, isToday }
}

function AppointmentCard({
  appt,
  onConfirm,
}: {
  appt: PortalAppointment
  onConfirm?: (id: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const { label: dateLabel, isToday } = formatApptDate(appt.scheduled_at)
  const statusCfg = APPT_STATUS_CONFIG[appt.status] ?? APPT_STATUS_CONFIG.SCHEDULED
  const canConfirm = appt.status === 'SCHEDULED' && onConfirm
  const isCancelled = appt.status === 'CANCELLED' || appt.status === 'NO_SHOW'

  async function handleConfirm() {
    if (!onConfirm) return
    setConfirming(true)
    try { await onConfirm(appt.id) } finally { setConfirming(false) }
  }

  return (
    <div
      className="portal-card"
      style={{
        borderColor: isToday ? '#F97316' : isCancelled ? 'var(--mt-border)' : undefined,
        background: isToday ? '#FFF7ED' : isCancelled ? 'var(--mt-elevated)' : undefined,
        opacity: isCancelled ? 0.7 : 1,
      }}
    >
      {/* Date + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: isToday ? '#FED7AA' : 'var(--mt-primary-subtle)',
            color: isToday ? '#C2410C' : 'var(--mt-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CalendarDays size={15} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: isToday ? '#C2410C' : 'var(--mt-text-2)' }}>
              {dateLabel}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--mt-muted)', fontWeight: 600 }}>
              {appt.duration_minutes} min · {APPT_TYPE_LABELS[appt.type] ?? appt.type}
            </p>
          </div>
        </div>
        <span style={{
          borderRadius: 999, padding: '3px 10px', flexShrink: 0,
          fontSize: 11, fontWeight: 800,
          color: statusCfg.color, background: statusCfg.bg,
          border: `1px solid ${statusCfg.color}22`,
        }}>
          {statusCfg.label}
        </span>
      </div>

      {/* Doctor */}
      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--mt-text)' }}>
        Dr. {appt.doctor.first_name} {appt.doctor.last_name}
      </p>
      {appt.doctor.specialty && (
        <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--mt-text-2)', fontWeight: 600 }}>
          {appt.doctor.specialty}
        </p>
      )}

      {/* Location */}
      {appt.location && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 6 }}>
          <MapPin size={13} style={{ color: 'var(--mt-muted)', marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mt-muted)', lineHeight: 1.4 }}>
            {appt.location.name}{appt.location.address ? ` · ${appt.location.address}` : ''}
          </p>
        </div>
      )}

      {/* Reason */}
      {appt.reason && (
        <p style={{ margin: '0 0 6px', fontSize: 12.5, color: 'var(--mt-text-2)', fontStyle: 'italic' }}>
          "{appt.reason}"
        </p>
      )}

      {/* Confirm action */}
      {canConfirm && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          style={{
            marginTop: 6, width: '100%', borderRadius: 12,
            padding: '10px 16px', border: 'none',
            background: '#047857', color: '#fff',
            fontSize: 13.5, fontWeight: 800,
            fontFamily: 'var(--mt-font)', cursor: confirming ? 'not-allowed' : 'pointer',
            opacity: confirming ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          {confirming
            ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />Confirmando…</>
            : <><CheckCircle2 size={15} />Confirmar asistencia</>
          }
        </button>
      )}
    </div>
  )
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [appts, setAppts] = useState<{ upcoming: PortalAppointment[]; past: PortalAppointment[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pastOpen, setPastOpen] = useState(false)

  const load = useCallback(async () => {
    const session = getSession()
    if (!session) {
      router.replace('/portal')
      return
    }
    try {
      const data = await getPortalAppointments(session.token)
      setAppts(data)
    } catch (err) {
      if (isUnauthorizedPortalError(err)) {
        clearSession()
        router.replace('/portal')
        return
      }
      setError('No se pudo cargar las citas. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  async function handleConfirm(appointmentId: string) {
    const session = getSession()
    if (!session) return
    const updated = await confirmAppointmentAttendance(session.token, appointmentId)
    setAppts(prev => {
      if (!prev) return prev
      return {
        ...prev,
        upcoming: prev.upcoming.map(a => a.id === updated.id ? { ...a, status: updated.status } : a),
      }
    })
  }

  return (
    <>
      <header className="portal-topbar">
        <MTLogo size={15} />
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--mt-muted)', fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--mt-font)', padding: '6px 8px', borderRadius: 8,
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Volver
        </button>
      </header>

      <div className="portal-body mt-page-in mt-scroll">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, color: 'var(--mt-text)', letterSpacing: '-0.02em' }}>
            Mis citas
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mt-muted)' }}>
            Próximas citas e historial de consultas
          </p>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
          </div>
        )}

        {error && (
          <div className="portal-card" style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--mt-text-2)' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
          </div>
        )}

        {appts && !loading && (
          <>
            {/* Upcoming section */}
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Próximas citas
              </h2>
              {appts.upcoming.length === 0 ? (
                <div className="portal-card" style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--mt-elevated)', color: 'var(--mt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <CalendarDays size={20} />
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--mt-text)' }}>Sin citas próximas</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mt-muted)' }}>Tu médico agendará la próxima consulta</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {appts.upcoming.map(appt => (
                    <AppointmentCard key={appt.id} appt={appt} onConfirm={handleConfirm} />
                  ))}
                </div>
              )}
            </section>

            {/* Past section — collapsible */}
            {appts.past.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setPastOpen(o => !o)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px',
                    fontFamily: 'var(--mt-font)',
                  }}
                  aria-expanded={pastOpen}
                >
                  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Historial ({appts.past.length})
                  </h2>
                  <ChevronDown
                    size={16}
                    color="var(--mt-muted)"
                    style={{ transform: pastOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                  />
                </button>
                {pastOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {appts.past.map(appt => (
                      <AppointmentCard key={appt.id} appt={appt} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
