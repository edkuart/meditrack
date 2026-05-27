'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CalendarDays, Stethoscope,
  ClipboardList, Eye, FlaskConical, BookOpen, FileText,
} from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getEncounterDetail, isUnauthorizedPortalError, type EncounterDetail } from '@/lib/portal/api'

const TYPE_LABELS: Record<string, string> = {
  CONSULTATION:         'Consulta',
  FOLLOW_UP:            'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización',
  DISCHARGE:            'Alta médica',
  CHRONIC_CONTROL:      'Control crónico',
  EMERGENCY:            'Emergencia',
}

interface SoapSection {
  key: keyof Pick<EncounterDetail, 'subjective' | 'objective' | 'assessment' | 'plan'>
  label: string
  sublabel: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

const SOAP_SECTIONS: SoapSection[] = [
  {
    key: 'subjective',
    label: 'Síntomas reportados',
    sublabel: 'Lo que me contaste en consulta',
    icon: ClipboardList,
    iconColor: 'var(--mt-primary)',
    iconBg: 'var(--mt-primary-subtle)',
  },
  {
    key: 'objective',
    label: 'Examen físico',
    sublabel: 'Hallazgos clínicos observados',
    icon: Eye,
    iconColor: '#0891B2',
    iconBg: '#E0F2FE',
  },
  {
    key: 'assessment',
    label: 'Diagnóstico',
    sublabel: 'Impresión diagnóstica del médico',
    icon: FlaskConical,
    iconColor: '#7C3AED',
    iconBg: '#EDE9FE',
  },
  {
    key: 'plan',
    label: 'Plan',
    sublabel: 'Indicaciones, estudios y tratamiento',
    icon: BookOpen,
    iconColor: '#059669',
    iconBg: 'var(--mt-success-subtle)',
  },
]

export default function EncounterDetailPage() {
  const router = useRouter()
  const params = useParams()
  const encounterId = params.id as string

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal'); return }

    getEncounterDetail(session.token, encounterId)
      .then(setEncounter)
      .catch((err) => {
        if (isUnauthorizedPortalError(err)) {
          clearSession()
          router.replace('/portal')
          return
        }
        setError('No se pudo cargar esta consulta.')
      })
      .finally(() => setLoading(false))
  }, [router, encounterId])

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

  if (error || !encounter) {
    return (
      <div className="portal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--mt-text)', marginBottom: 6 }}>
            {error ?? 'Consulta no encontrada'}
          </p>
          <Link href="/portal/history" style={{ fontSize: 13.5, color: 'var(--mt-primary)', fontWeight: 700 }}>
            ← Volver a consultas
          </Link>
        </div>
      </div>
    )
  }

  const isOpen = encounter.status !== 'CLOSED'
  const openedDate = new Date(encounter.opened_at).toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const hasSoap = SOAP_SECTIONS.some(s => Boolean(encounter[s.key]))

  return (
    <div className="portal-body mt-page-in">
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 18px' }}>
          <Link
            href="/portal/history"
            aria-label="Volver a consultas"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 999, flexShrink: 0,
              background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
              boxShadow: 'var(--mt-shadow-xs)', color: 'var(--mt-text-2)',
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)', lineHeight: 1.15 }}>
              {TYPE_LABELS[encounter.encounter_type] ?? encounter.encounter_type}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--mt-muted)', textTransform: 'capitalize' }}>
              {openedDate}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Meta card — doctor + status */}
          <div className="portal-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',
              }}>
                <Stethoscope size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--mt-text)', letterSpacing: '-0.01em' }}>
                  Dr. {encounter.doctor.first_name} {encounter.doctor.last_name}
                </p>
                {encounter.doctor.specialty && (
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)' }}>
                    {encounter.doctor.specialty}
                  </p>
                )}
                <p style={{ margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--mt-muted)' }}>
                  <CalendarDays size={12} />
                  {openedDate}
                  {encounter.closed_at && (
                    <> · Cerrada {new Date(encounter.closed_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</>
                  )}
                </p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                background: isOpen ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
                color: isOpen ? 'var(--mt-primary)' : 'var(--mt-muted)',
              }}>
                {isOpen ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
          </div>

          {/* Chief complaint */}
          {encounter.chief_complaint && (
            <div className="portal-card" style={{ padding: '14px 16px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--mt-muted)' }}>
                Motivo de consulta
              </p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--mt-text)', lineHeight: 1.5 }}>
                {encounter.chief_complaint}
              </p>
            </div>
          )}

          {/* SOAP sections */}
          {hasSoap && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--mt-muted)', padding: '0 2px' }}>
                Notas de la consulta
              </p>
              {SOAP_SECTIONS.filter(s => Boolean(encounter[s.key])).map(section => (
                <SoapCard
                  key={section.key}
                  section={section}
                  content={encounter[section.key]!}
                />
              ))}
            </div>
          )}

          {/* Summary */}
          {encounter.summary && (
            <div className="portal-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#FEF3C7', color: '#B45309',
                }}>
                  <FileText size={15} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--mt-text)' }}>Resumen</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--mt-muted)' }}>Nota del médico para el expediente</p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--mt-text-2)' }}>
                {encounter.summary}
              </p>
            </div>
          )}

          {/* Empty state — closed encounter with no notes */}
          {!hasSoap && !encounter.chief_complaint && !encounter.summary && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--mt-muted)' }}>
                No hay notas disponibles para esta consulta.
              </p>
            </div>
          )}

        </div>

        <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--mt-muted)', lineHeight: 1.5, padding: '0 16px' }}>
          Estas notas fueron registradas por tu equipo médico. Si tienes dudas sobre su contenido, consúltales directamente.
        </p>
      </div>
    </div>
  )
}

function SoapCard({ section, content }: { section: SoapSection; content: string }) {
  const Icon = section.icon
  return (
    <div className="portal-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: section.iconBg, color: section.iconColor,
        }}>
          <Icon size={15} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--mt-text)' }}>{section.label}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--mt-muted)' }}>{section.sublabel}</p>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--mt-text-2)', whiteSpace: 'pre-wrap' }}>
        {content}
      </p>
    </div>
  )
}
