'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle, ArrowLeft, Clock3, ClipboardList, TrendingUp,
  UserPlus, Stethoscope,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getPendingDosesAlert, getMissedDosesAlert,
  getNewPatientsAlert, getActiveTreatmentsAlert,
  type AlertPatient,
} from '@/lib/doctor/analytics-api'
import {
  ClinicalPage, MTAvatar, MTPill, LoadingState,
  EmptyClinicalState, MTPanel,
} from '@/components/doctor/clinical-ui'

// ─── Alert config ─────────────────────────────────────────────────────────────

const ALERT_CONFIG = {
  'pending-doses': {
    title: 'Dosis pendientes hoy',
    subtitle: 'Pacientes con dosis programadas aún no confirmadas para hoy.',
    icon: Clock3,
    accent: 'amber' as const,
    badge: (p: AlertPatient) => p.dose_count ? `${p.dose_count} pendientes` : undefined,
    badgeTone: 'amber' as const,
    emptyTitle: 'Sin dosis pendientes',
    emptyDesc: 'Todos los pacientes han confirmado sus dosis por hoy.',
  },
  'missed-doses': {
    title: 'Dosis perdidas hoy',
    subtitle: 'Pacientes que no confirmaron dosis programadas para hoy.',
    icon: AlertCircle,
    accent: 'red' as const,
    badge: (p: AlertPatient) => p.dose_count ? `${p.dose_count} perdidas` : undefined,
    badgeTone: 'red' as const,
    emptyTitle: 'Sin dosis perdidas',
    emptyDesc: 'Ningún paciente tiene dosis marcadas como perdidas hoy.',
  },
  'active-treatments': {
    title: 'Tratamientos activos',
    subtitle: 'Pacientes actualmente bajo seguimiento terapéutico activo.',
    icon: ClipboardList,
    accent: 'blue' as const,
    badge: (p: AlertPatient) => p.active_treatments ? `${p.active_treatments} tratamiento${p.active_treatments > 1 ? 's' : ''}` : undefined,
    badgeTone: 'blue' as const,
    emptyTitle: 'Sin tratamientos activos',
    emptyDesc: 'No hay pacientes con planes de tratamiento activos.',
  },
  'new-no-encounter': {
    title: 'Nuevos sin primera consulta',
    subtitle: 'Pacientes registrados este mes que aún no tienen ninguna consulta abierta.',
    icon: TrendingUp,
    accent: 'green' as const,
    badge: () => 'Sin consulta',
    badgeTone: 'amber' as const,
    emptyTitle: 'Todos con consulta',
    emptyDesc: 'Todos los pacientes nuevos de este mes ya tienen su primera consulta registrada.',
  },
} as const

type AlertType = keyof typeof ALERT_CONFIG

// ─── Patient row ──────────────────────────────────────────────────────────────

function AlertPatientRow({ patient, badge, badgeTone, isLast }: {
  patient: AlertPatient
  badge?: string
  badgeTone: 'amber' | 'red' | 'blue' | 'green'
  isLast: boolean
}) {
  const [hover, setHover] = useState(false)
  const fullName = `${patient.first_name} ${patient.last_name}`

  return (
    <Link
      href={`/patients/${patient.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        background: hover ? 'var(--mt-elevated)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--mt-border)',
        transition: 'background .2s', textDecoration: 'none',
        minWidth: 0,
      }}
    >
      <MTAvatar name={fullName} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500,
            color: 'var(--mt-text)', overflow: 'hidden',
            whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {fullName}
          </span>
          {badge && <MTPill tone={badgeTone} style={{ flexShrink: 0 }}>{badge}</MTPill>}
        </div>
        {patient.created_at && (
          <div className="mt-small" style={{ marginTop: 2 }}>
            Registrado el {new Date(patient.created_at + 'T00:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={hover ? 'var(--mt-text)' : 'var(--mt-muted)'} strokeWidth="2"
        style={{ flexShrink: 0, transition: 'stroke .2s, transform .2s', transform: hover ? 'translateX(2px)' : 'none' }}>
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertDetailPage() {
  const { token } = useAuth()
  const params = useParams()
  const type = params.type as AlertType

  const [patients, setPatients] = useState<AlertPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const config = ALERT_CONFIG[type]

  useEffect(() => {
    if (!token || !config) return
    setLoading(true)
    setError('')

    const fetcher = {
      'pending-doses':     () => getPendingDosesAlert(token).then(d => d.patients),
      'missed-doses':      () => getMissedDosesAlert(token).then(d => d.patients),
      'active-treatments': () => getActiveTreatmentsAlert(token).then(d => d.patients),
      'new-no-encounter':  () => getNewPatientsAlert(token).then(d => d.patients),
    }[type]

    fetcher?.()
      .then(setPatients)
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [token, type])

  if (!config) {
    return (
      <ClinicalPage size="compact">
        <EmptyClinicalState title="Vista no encontrada" description="El tipo de alerta indicado no existe." />
      </ClinicalPage>
    )
  }

  const Icon = config.icon

  return (
    <ClinicalPage size="compact">
      {/* Back link */}
      <Link href="/dashboard" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, color: 'var(--mt-text-2)', textDecoration: 'none',
        marginBottom: 4,
      }}>
        <ArrowLeft size={14} />
        Panel operativo
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 20, borderBottom: '1px solid var(--mt-border)' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className="mt-heading" style={{ marginBottom: 4 }}>{config.title}</h1>
          <p className="mt-small">{config.subtitle}</p>
        </div>
        {!loading && !error && (
          <MTPill tone={config.accent} style={{ flexShrink: 0, marginLeft: 'auto' }}>
            {patients.length} {patients.length === 1 ? 'paciente' : 'pacientes'}
          </MTPill>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div style={{ background: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)', fontSize: 14, borderRadius: 10, padding: 16 }}>
          {error}
        </div>
      ) : patients.length === 0 ? (
        <EmptyClinicalState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyDesc}
        />
      ) : (
        <MTPanel title={`${patients.length} paciente${patients.length > 1 ? 's' : ''}`} icon={UserPlus} accent={config.accent}>
          {patients.map((p, i) => (
            <AlertPatientRow
              key={p.id}
              patient={p}
              badge={config.badge(p)}
              badgeTone={config.badgeTone}
              isLast={i === patients.length - 1}
            />
          ))}
        </MTPanel>
      )}

      {/* Action hint for new-no-encounter */}
      {type === 'new-no-encounter' && patients.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: 14, borderRadius: 10,
          background: '#fffbeb', border: '1px solid #fde68a',
        }}>
          <Stethoscope size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#b45309', lineHeight: 1.55 }}>
            Para abrir la primera consulta: entra al perfil del paciente → botón <strong>Nueva consulta</strong>. Una vez cerrada, el paciente desaparece de esta lista.
          </p>
        </div>
      )}
    </ClinicalPage>
  )
}
