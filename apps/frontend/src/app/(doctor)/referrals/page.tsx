'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  CheckCircle, XCircle, Loader2,
  Send, Inbox, RefreshCw, AlertTriangle, ArrowUpDown, BedDouble, Plus, Search, X,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listDoctorReferrals, acceptReferral, rejectReferral,
  completeReferral, cancelReferral, createReferral, listPatients,
  type Referral, type ReferralStatus, type ReferralPriority,
} from '@/lib/doctor/api'
import { listStaff, type StaffMember } from '@/lib/doctor/staff-api'
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
  const { token, user } = useAuth()
  const isHospital = user?.tenant_type === 'HOSPITAL'
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

      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{referral.reason}</p>

      {referral.response_notes && (
        <p className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-2">
          {referral.response_notes}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-400">
          {new Date(referral.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        {loading ? (
          <Loader2 size={16} className="animate-spin text-slate-400" />
        ) : (
          <div className="flex gap-2 flex-wrap justify-end">
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
              <>
                <button
                  onClick={() => act('complete')}
                  className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors"
                >
                  <CheckCircle size={13} /> Completar
                </button>
                {isHospital && referral.patient_id && (
                  <Link
                    href={`/patients/${referral.patient_id}?openTab=admissions&referralId=${referral.id}`}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <BedDouble size={13} /> Internar
                  </Link>
                )}
              </>
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

// ─── New referral modal ────────────────────────────────────────────────────────

function NewReferralModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth()

  // Patient search
  const [patientQ, setPatientQ] = useState('')
  const [patients, setPatients] = useState<Array<{ id: string; first_name: string; last_name: string; mrn: string | null }>>([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; first_name: string; last_name: string } | null>(null)
  const patientTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Doctor list
  const [doctors, setDoctors] = useState<StaffMember[]>([])
  const [toDoctorId, setToDoctorId] = useState('')

  // Form fields
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<ReferralPriority>('ROUTINE')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load doctors on mount
  useEffect(() => {
    if (!token) return
    listStaff(token).then(res => {
      const eligible = res.staff.filter(m =>
        (m.role === 'DOCTOR' || m.role === 'ADMIN_CLINIC') && m.is_active && m.is_verified
      )
      setDoctors(eligible)
    }).catch(() => {})
  }, [token])

  // Debounced patient search
  useEffect(() => {
    if (!token || patientQ.length < 2) { setPatients([]); return }
    if (patientTimer.current) clearTimeout(patientTimer.current)
    patientTimer.current = setTimeout(async () => {
      setPatientLoading(true)
      try {
        const res = await listPatients(token, patientQ, 1, 8)
        setPatients(res.patients)
      } finally {
        setPatientLoading(false)
      }
    }, 300)
  }, [patientQ, token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedPatient || !reason.trim() || !toDoctorId) return
    setSubmitting(true)
    setError(null)
    try {
      await createReferral(token, selectedPatient.id, {
        to_doctor_id: toDoctorId,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        priority,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la referencia')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!selectedPatient && !!toDoctorId && reason.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Nueva referencia médica</h2>
            <p className="text-xs text-slate-400 mt-0.5">Envía un paciente a otro médico</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Patient search */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Paciente *</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between px-3 py-2.5 border border-blue-200 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium text-blue-800">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedPatient(null); setPatientQ('') }}
                  className="text-blue-400 hover:text-blue-600"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={patientQ}
                  onChange={e => setPatientQ(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {patientLoading && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
                )}
                {patients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                    {patients.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPatient(p); setPatients([]); setPatientQ('') }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-blue-600">
                            {p.first_name[0]}{p.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                          {p.mrn && <div className="text-xs text-slate-400 font-mono">{p.mrn}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Doctor selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Referir a *</label>
            <select
              value={toDoctorId}
              onChange={e => setToDoctorId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            >
              <option value="">Selecciona un médico...</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  Dr. {d.first_name} {d.last_name}{d.specialty ? ` — ${d.specialty}` : ''}
                </option>
              ))}
            </select>
            {doctors.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No hay otros médicos activos en tu clínica.</p>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Prioridad</label>
            <div className="flex gap-2">
              {(['ROUTINE', 'URGENT', 'EMERGENCY'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    priority === p
                      ? p === 'ROUTINE'   ? 'bg-slate-700 text-white border-slate-700'
                      : p === 'URGENT'    ? 'bg-amber-500 text-white border-amber-500'
                                         : 'bg-red-500 text-white border-red-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Motivo de la referencia *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe el motivo clínico de la referencia..."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Notas adicionales</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional para el médico receptor (opcional)..."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: canSubmit && !submitting ? 'var(--mt-primary)' : undefined, backgroundColor: (!canSubmit || submitting) ? '#94a3b8' : undefined }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar referencia
            </button>
          </div>
        </form>
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
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await listDoctorReferrals(token, tab)
      setReferrals(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando referencias')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  useEffect(() => { load() }, [load])

  const pendingCount = referrals.filter(r => r.status === 'PENDING').length

  return (
    <ClinicalPage>
      {modalOpen && (
        <NewReferralModal
          onClose={() => setModalOpen(false)}
          onCreated={() => { setTab('outgoing'); load() }}
        />
      )}

      <ClinicalHeader
        title="Referencias médicas"
        subtitle="Envía y recibe referencias entre médicos de tu clínica"
        icon={ArrowUpDown}
        actions={
          <div className="flex gap-2">
            <ClinicalButton icon={RefreshCw} variant="outline" tone="slate" onClick={load}>
              Actualizar
            </ClinicalButton>
            <ClinicalButton icon={Plus} variant="solid" tone="blue" onClick={() => setModalOpen(true)}>
              Nueva referencia
            </ClinicalButton>
          </div>
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

      <ClinicalPanel title={tab === 'incoming' ? 'Referencias recibidas' : 'Referencias enviadas'} collapsible defaultOpen={false}>
        {loading ? (
          <LoadingState label="Cargando referencias..." />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle size={32} className="text-red-400" />
            <p className="text-sm text-slate-500">{error}</p>
            <ClinicalButton variant="outline" tone="slate" onClick={load}>Reintentar</ClinicalButton>
          </div>
        ) : referrals.length === 0 ? (
          <EmptyClinicalState
            icon={tab === 'incoming' ? Inbox : Send}
            title={tab === 'incoming' ? 'Sin referencias recibidas' : 'Sin referencias enviadas'}
            description={
              tab === 'incoming'
                ? 'Aquí aparecerán las referencias que otros médicos te envíen.'
                : 'Las referencias que envíes a otros médicos aparecerán aquí.'
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
