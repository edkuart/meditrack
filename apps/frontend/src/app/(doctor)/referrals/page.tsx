'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, CheckCircle, XCircle, Clock, Loader2,
  Send, Inbox, RefreshCw, AlertTriangle, Zap, ArrowUpDown,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listDoctorReferrals, acceptReferral, rejectReferral,
  completeReferral, cancelReferral,
  type Referral, type ReferralStatus,
} from '@/lib/doctor/api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, ClinicalPanel,
  EmptyClinicalState, LoadingState, StatusPill, type Tone,
} from '@/components/doctor/clinical-ui'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReferralStatus, { label: string; tone: Tone }> = {
  PENDING:   { label: 'Pendiente',  tone: 'amber'  },
  ACCEPTED:  { label: 'Aceptada',   tone: 'blue'   },
  REJECTED:  { label: 'Rechazada',  tone: 'red'    },
  COMPLETED: { label: 'Completada', tone: 'green'  },
  CANCELLED: { label: 'Cancelada',  tone: 'slate'  },
}

const PRIORITY_CONFIG = {
  ROUTINE:   { label: 'Rutina',     bg: 'bg-slate-100',  fg: 'text-slate-600' },
  URGENT:    { label: 'Urgente',    bg: 'bg-amber-100',  fg: 'text-amber-700' },
  EMERGENCY: { label: 'Emergencia', bg: 'bg-red-100',    fg: 'text-red-700'   },
}

// ─── Referral card ─────────────────────────────────────────────────────────────

function ReferralCard({
  referral,
  isIncoming,
  onAction,
}: {
  referral: Referral
  isIncoming: boolean
  onAction: () => void
}) {
  const [loading, setLoading] = useState(false)
  const { token } = useAuth()
  const cfg = STATUS_CONFIG[referral.status]
  const prio = PRIORITY_CONFIG[referral.priority]

  async function act(action: 'accept' | 'reject' | 'complete' | 'cancel') {
    if (!token) return
    setLoading(true)
    try {
      if (action === 'accept')   await acceptReferral(token, referral.id)
      if (action === 'reject')   await rejectReferral(token, referral.id)
      if (action === 'complete') await completeReferral(token, referral.id)
      if (action === 'cancel')   await cancelReferral(token, referral.id)
      onAction()
    } finally {
      setLoading(false)
    }
  }

  const doctor = isIncoming ? referral.from_doctor : referral.to_doctor
  const doctorLabel = isIncoming ? 'De' : 'Para'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {referral.patient && (
            <Link
              href={`/patients/${referral.patient_id}`}
              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
            >
              {referral.patient.first_name} {referral.patient.last_name}
              {referral.patient.mrn && (
                <span className="ml-2 font-mono text-xs text-blue-500">{referral.patient.mrn}</span>
              )}
            </Link>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {doctorLabel}: {doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : referral.to_department?.name ?? '—'}
            {doctor?.specialty && <span className="ml-1 text-slate-300">· {doctor.specialty}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${prio.bg} ${prio.fg}`}>
            {prio.label}
          </span>
          <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{referral.reason}</p>

      {/* Response notes */}
      {referral.response_notes && (
        <p className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-2">
          {referral.response_notes}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-400">
          {new Date(referral.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        {/* Actions */}
        {loading ? (
          <Loader2 size={16} className="animate-spin text-slate-400" />
        ) : (
          <div className="flex gap-2">
            {isIncoming && referral.status === 'PENDING' && (
              <>
                <button
                  onClick={() => act('accept')}
                  className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 transition-colors"
                >
                  <CheckCircle size={13} /> Aceptar
                </button>
                <button
                  onClick={() => act('reject')}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  <XCircle size={13} /> Rechazar
                </button>
              </>
            )}
            {isIncoming && referral.status === 'ACCEPTED' && (
              <button
                onClick={() => act('complete')}
                className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
              >
                <CheckCircle size={13} /> Completar
              </button>
            )}
            {!isIncoming && ['PENDING', 'ACCEPTED'].includes(referral.status) && (
              <button
                onClick={() => act('cancel')}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                <XCircle size={13} /> Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'incoming' | 'outgoing'

export default function ReferralsPage() {
  const { token } = useAuth()
  const [tab, setTab] = useState<Tab>('incoming')
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await listDoctorReferrals(token, tab)
      setReferrals(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando derivaciones')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  useEffect(() => { load() }, [load])

  const incoming = referrals.filter(r => true) // already filtered by API
  const pendingCount = referrals.filter(r => r.status === 'PENDING').length

  return (
    <ClinicalPage>
      <ClinicalHeader
        title="Derivaciones"
        subtitle="Bandeja de derivaciones enviadas y recibidas"
        icon={ArrowUpDown}
        actions={
          <ClinicalButton icon={RefreshCw} variant="outline" tone="slate" onClick={load}>
            Actualizar
          </ClinicalButton>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {([
          { key: 'incoming', label: 'Recibidas', icon: Inbox },
          { key: 'outgoing', label: 'Enviadas',  icon: Send  },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
            {key === 'incoming' && pendingCount > 0 && !loading && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <ClinicalPanel title="Derivaciones">
        {loading ? (
          <LoadingState label="Cargando derivaciones..." />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle size={32} className="text-red-400" />
            <p className="text-sm text-slate-500">{error}</p>
            <ClinicalButton variant="outline" tone="slate" onClick={load}>Reintentar</ClinicalButton>
          </div>
        ) : referrals.length === 0 ? (
          <EmptyClinicalState
            icon={tab === 'incoming' ? Inbox : Send}
            title={tab === 'incoming' ? 'Sin derivaciones recibidas' : 'Sin derivaciones enviadas'}
            description={
              tab === 'incoming'
                ? 'Aquí aparecerán las derivaciones que otros médicos te envíen.'
                : 'Las derivaciones que envíes a otros médicos aparecerán aquí.'
            }
          />
        ) : (
          <div className="space-y-3">
            {referrals.map(r => (
              <ReferralCard
                key={r.id}
                referral={r}
                isIncoming={tab === 'incoming'}
                onAction={load}
              />
            ))}
          </div>
        )}
      </ClinicalPanel>
    </ClinicalPage>
  )
}
