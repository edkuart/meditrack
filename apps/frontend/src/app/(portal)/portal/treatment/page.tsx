'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Clock,
  Info,
  Pill,
  ShieldCheck,
  Utensils,
} from 'lucide-react'
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
      <div className="portal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '4px solid var(--mt-primary-mist)',
            borderTopColor: 'var(--mt-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 999,
              background: 'var(--mt-surface)',
              border: '1px solid var(--mt-border)',
              boxShadow: 'var(--mt-shadow-xs)',
              color: 'var(--mt-text-2)',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: 'var(--mt-text)',
                lineHeight: 1.15,
              }}
            >
              Mi plan
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
              Indicaciones activas de tu equipo médico
            </p>
          </div>
        </div>

        {plans.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--mt-text-2)' }}>
            <div
              style={{
                margin: '0 auto 14px',
                width: 56,
                height: 56,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--mt-primary-subtle)',
                color: 'var(--mt-primary)',
              }}
            >
              <ShieldCheck size={26} />
            </div>
            <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--mt-text)' }}>
              No tienes un tratamiento activo
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>
              Tu médico te asignará uno cuando corresponda.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="portal-plan-summary">
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 800,
                  color: 'var(--mt-primary)',
                  letterSpacing: '-0.005em',
                }}
              >
                {plans.length === 1 ? '1 tratamiento activo' : `${plans.length} tratamientos activos`}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: 'var(--mt-primary-deep)',
                }}
              >
                Sigue las indicaciones como te las entregaron. Si notas algo diferente o tienes dudas, consulta con tu equipo médico.
              </p>
            </div>

            {plans.map(plan => (
              <section key={plan.id} className="portal-plan-card">
                <div className="portal-plan-card-head">
                  <span className="portal-plan-active-pill">
                    <ShieldCheck size={12} strokeWidth={2.5} />
                    Activo
                  </span>
                  <h2
                    style={{
                      margin: '8px 0 0',
                      fontSize: 18,
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: 'var(--mt-text)',
                      lineHeight: 1.2,
                    }}
                  >
                    {plan.name}
                  </h2>
                  <p
                    style={{
                      margin: '6px 0 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: 'var(--mt-text-2)',
                    }}
                  >
                    <CalendarDays size={13} />
                    {formatDate(plan.start_date)}
                    {plan.end_date && <> — {formatDate(plan.end_date)}</>}
                  </p>
                  {plan.instructions && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'var(--mt-primary-subtle)',
                        color: 'var(--mt-primary-deep)',
                        display: 'flex',
                        gap: 8,
                        fontSize: 13.5,
                        lineHeight: 1.5,
                      }}
                    >
                      <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                      <p style={{ margin: 0 }}>{plan.instructions}</p>
                    </div>
                  )}
                </div>

                {/* Medications */}
                {plan.medications.map(med => (
                  <div key={med.id} className="portal-plan-item">
                    <div className="portal-plan-item-icon med">
                      <Pill size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 800,
                          letterSpacing: '-0.015em',
                          color: 'var(--mt-text)',
                          lineHeight: 1.25,
                        }}
                      >
                        {med.drug_name}
                      </p>
                      {med.presentation && (
                        <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--mt-muted)' }}>
                          {med.presentation}
                        </p>
                      )}
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: 13.5,
                          color: 'var(--mt-text-2)',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: 'var(--mt-text)' }}>
                          {med.dose_amount} {med.dose_unit}
                        </span>
                        {' · '}
                        {FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                      </p>

                      {med.times_per_day && med.times_per_day.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {med.times_per_day.map(time => (
                            <span key={time} className="portal-time-tag">
                              <Clock size={12} strokeWidth={2.5} />
                              {time}
                            </span>
                          ))}
                        </div>
                      )}

                      {med.with_food && (
                        <div style={{ marginTop: 10 }}>
                          <span className="portal-food-chip">
                            <Utensils size={11} strokeWidth={2.4} />
                            Tomar con comida
                          </span>
                        </div>
                      )}

                      {med.special_instructions && (
                        <p className="portal-med-note">{med.special_instructions}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Interventions */}
                {(plan.interventions ?? []).map(iv => (
                  <div key={iv.id} className="portal-plan-item">
                    <div className="portal-plan-item-icon intervention">
                      <Activity size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 800,
                          letterSpacing: '-0.015em',
                          color: 'var(--mt-text)',
                          lineHeight: 1.25,
                        }}
                      >
                        {iv.title}
                      </p>
                      {iv.frequency && (
                        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--mt-text-2)' }}>
                          {iv.frequency}
                        </p>
                      )}
                      {iv.duration && (
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--mt-muted)' }}>
                          {iv.duration}
                        </p>
                      )}
                      {iv.instructions && (
                        <p className="portal-intervention-note">{iv.instructions}</p>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
