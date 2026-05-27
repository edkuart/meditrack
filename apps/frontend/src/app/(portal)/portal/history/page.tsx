'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, ChevronRight, Stethoscope } from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getHistory, isUnauthorizedPortalError } from '@/lib/portal/api'

type Encounter = Awaited<ReturnType<typeof getHistory>>[number]

const TYPE_LABELS: Record<string, string> = {
  CONSULTATION:         'Consulta',
  FOLLOW_UP:            'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización',
  DISCHARGE:            'Alta médica',
  CHRONIC_CONTROL:      'Control crónico',
  EMERGENCY:            'Emergencia',
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
      <div className="portal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '4px solid var(--mt-primary-mist)',
          borderTopColor: 'var(--mt-primary)',
          animation: 'spin 1s linear infinite',
        }} />
      </div>
    )
  }

  return (
    <div className="portal-body mt-page-in">
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 18px' }}>
          <Link
            href="/portal"
            aria-label="Volver"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 999,
              background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
              boxShadow: 'var(--mt-shadow-xs)', color: 'var(--mt-text-2)', flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)', lineHeight: 1.15 }}>
              Mis consultas
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
              Resumen de visitas compartidas por tu equipo médico
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.length === 0 ? (
            <div style={{ padding: '64px 20px', textAlign: 'center' }}>
              <div style={{
                margin: '0 auto 14px', width: 56, height: 56, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',
              }}>
                <CalendarDays size={26} />
              </div>
              <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--mt-text)' }}>
                No hay consultas registradas
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
                Cuando tu equipo médico comparta consultas, aparecerán aquí.
              </p>
            </div>
          ) : (
            history.map(enc => (
              <EncounterCard key={enc.id} enc={enc} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function EncounterCard({ enc }: { enc: Encounter }) {
  const isOpen = enc.status !== 'CLOSED'
  return (
    <Link href={`/portal/history/${enc.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div className="portal-plan-card" style={{ transition: 'box-shadow 0.15s ease' }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',
            }}>
              <Stethoscope size={18} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--mt-text)', letterSpacing: '-0.01em' }}>
                  {TYPE_LABELS[enc.encounter_type] ?? enc.encounter_type}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                    background: isOpen ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
                    color: isOpen ? 'var(--mt-primary)' : 'var(--mt-muted)',
                  }}>
                    {isOpen ? 'Abierta' : 'Cerrada'}
                  </span>
                  <ChevronRight size={15} color="var(--mt-muted)" />
                </div>
              </div>

              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)' }}>
                Dr. {enc.doctor.first_name} {enc.doctor.last_name}
                {enc.doctor.specialty && ` · ${enc.doctor.specialty}`}
              </p>

              <p style={{ margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--mt-muted)' }}>
                <CalendarDays size={12} />
                {new Date(enc.opened_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>

              {enc.chief_complaint && (
                <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.45 }}>
                  {enc.chief_complaint}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
