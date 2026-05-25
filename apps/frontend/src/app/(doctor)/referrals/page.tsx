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
  EmptyClinicalState, LoadingState, StatusPill, MTButton, type Tone,
} from '@/components/doctor/clinical-ui'

const STATUS_CONFIG: Record<ReferralStatus, { label: string; tone: Tone }> = {
  PENDING:   { label: 'Pendiente',  tone: 'amber'  },
  ACCEPTED:  { label: 'Aceptada',   tone: 'blue'   },
  REJECTED:  { label: 'Rechazada',  tone: 'red'    },
  COMPLETED: { label: 'Completada', tone: 'green'  },
  CANCELLED: { label: 'Cancelada',  tone: 'slate'  },
}

const PRIORITY_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  ROUTINE:   { label: 'Rutina',     bg: 'var(--mt-elevated)', color: 'var(--mt-text-2)' },
  URGENT:    { label: 'Urgente',    bg: '#FEF3C7',            color: '#92400E' },
  EMERGENCY: { label: 'Emergencia', bg: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--mt-border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: 'var(--mt-text)',
  background: 'var(--mt-surface)', outline: 'none',
  fontFamily: 'var(--mt-font)', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)', marginBottom: 5,
}

function ReferralCard({ referral, isIncoming, onAction }: {
  referral: Referral; isIncoming: boolean; onAction: () => void
}) {
  const [loading, setLoading] = useState(false)
  const { token, user } = useAuth()
  const isHospital = user?.tenant_type === 'HOSPITAL'
  const cfg = STATUS_CONFIG[referral.status]
  const prio = PRIORITY_STYLES[referral.priority]
  const doctor = isIncoming ? referral.from_doctor : referral.to_doctor
  const doctorLabel = isIncoming ? 'De' : 'Para'

  async function act(action: 'accept' | 'reject' | 'complete' | 'cancel') {
    if (!token) return
    setLoading(true)
    try {
      if (action === 'accept')   await acceptReferral(token, referral.id)
      if (action === 'reject')   await rejectReferral(token, referral.id)
      if (action === 'complete') await completeReferral(token, referral.id)
      if (action === 'cancel')   await cancelReferral(token, referral.id)
      onAction()
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
      borderRadius: 12, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: 'var(--mt-shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {referral.patient && (
            <Link href={`/patients/${referral.patient_id}`} style={{ fontWeight: 600, color: 'var(--mt-text)', fontSize: 13, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--mt-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--mt-text)')}
            >
              {referral.patient.first_name} {referral.patient.last_name}
              {referral.patient.mrn && (
                <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: 'var(--mt-primary)' }}>{referral.patient.mrn}</span>
              )}
            </Link>
          )}
          <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '4px 0 0' }}>
            {doctorLabel}: {doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : referral.to_department?.name ?? '—'}
            {doctor?.specialty && <span style={{ marginLeft: 6, color: 'var(--mt-border)' }}>· {doctor.specialty}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: prio.bg, color: prio.color }}>
            {prio.label}
          </span>
          <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {referral.reason}
      </p>

      {referral.response_notes && (
        <p style={{ fontSize: 12, color: 'var(--mt-muted)', fontStyle: 'italic', margin: 0, paddingLeft: 10, borderLeft: '2px solid var(--mt-border)' }}>
          {referral.response_notes}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
          {new Date(referral.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        {loading ? (
          <Loader2 size={16} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isIncoming && referral.status === 'PENDING' && (
              <>
                <ActBtn onClick={() => act('accept')} color="var(--mt-success)" icon={<CheckCircle size={13} />}>Aceptar</ActBtn>
                <ActBtn onClick={() => act('reject')} color="var(--mt-danger)" icon={<XCircle size={13} />}>Rechazar</ActBtn>
              </>
            )}
            {isIncoming && referral.status === 'ACCEPTED' && (
              <>
                <ActBtn onClick={() => act('complete')} color="var(--mt-primary)" icon={<CheckCircle size={13} />}>Completar</ActBtn>
                {isHospital && referral.patient_id && (
                  <Link href={`/patients/${referral.patient_id}?openTab=admissions&referralId=${referral.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--mt-purple)', textDecoration: 'none' }}>
                    <BedDouble size={13} /> Internar
                  </Link>
                )}
              </>
            )}
            {!isIncoming && ['PENDING', 'ACCEPTED'].includes(referral.status) && (
              <ActBtn onClick={() => act('cancel')} color="var(--mt-muted)" icon={<XCircle size={13} />}>Cancelar</ActBtn>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActBtn({ onClick, color, icon, children }: { onClick: () => void; color: string; icon: React.ReactNode; children: string }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 500, color, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      {icon} {children}
    </button>
  )
}

function NewReferralModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth()
  const [patientQ, setPatientQ] = useState('')
  const [patients, setPatients] = useState<Array<{ id: string; first_name: string; last_name: string; mrn: string | null }>>([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; first_name: string; last_name: string } | null>(null)
  const patientTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [doctors, setDoctors] = useState<StaffMember[]>([])
  const [toDoctorId, setToDoctorId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<ReferralPriority>('ROUTINE')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    listStaff(token).then(res => {
      setDoctors(res.staff.filter(m => (m.role === 'DOCTOR' || m.role === 'ADMIN_CLINIC') && m.is_active && m.is_verified))
    }).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token || patientQ.length < 2) { setPatients([]); return }
    if (patientTimer.current) clearTimeout(patientTimer.current)
    patientTimer.current = setTimeout(async () => {
      setPatientLoading(true)
      try { setPatients((await listPatients(token, patientQ, 1, 8)).patients) }
      finally { setPatientLoading(false) }
    }, 300)
  }, [patientQ, token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedPatient || !reason.trim() || !toDoctorId) return
    setSubmitting(true)
    setError(null)
    try {
      await createReferral(token, selectedPatient.id, { to_doctor_id: toDoctorId, reason: reason.trim(), notes: notes.trim() || undefined, priority })
      onCreated(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la referencia')
    } finally { setSubmitting(false) }
  }

  const canSubmit = !!selectedPatient && !!toDoctorId && reason.trim().length > 0

  const PRIO_ACTIVE: Record<string, { bg: string; color: string }> = {
    ROUTINE:   { bg: 'var(--mt-text)', color: '#fff' },
    URGENT:    { bg: '#F59E0B', color: '#fff' },
    EMERGENCY: { bg: 'var(--mt-danger)', color: '#fff' },
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--mt-surface)', borderRadius: 16, boxShadow: '0 20px 60px rgba(15,23,42,.3)', width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--mt-border)' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Nueva referencia médica</h2>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '3px 0 0' }}>Envía un paciente a otro médico</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', display: 'flex', padding: 6, borderRadius: 8 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Patient search */}
          <div>
            <label style={labelStyle}>Paciente *</label>
            {selectedPatient ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--mt-primary-mist)', background: 'var(--mt-primary-subtle)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-primary-deep)' }}>
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </span>
                <button type="button" onClick={() => { setSelectedPatient(null); setPatientQ('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-primary)', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mt-muted)', pointerEvents: 'none' }} />
                <input type="text" placeholder="Buscar por nombre..." value={patientQ} onChange={e => setPatientQ(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 32 }} autoFocus />
                {patientLoading && <Loader2 size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--mt-muted)' }} />}
                {patients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--mt-surface)', border: '1px solid var(--mt-border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.12)', zIndex: 10, overflow: 'hidden' }}>
                    {patients.map(p => (
                      <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatients([]); setPatientQ('') }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--mt-primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-primary)' }}>{p.first_name[0]}{p.last_name[0]}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)' }}>{p.first_name} {p.last_name}</div>
                          {p.mrn && <div style={{ fontSize: 11, color: 'var(--mt-muted)', fontFamily: 'monospace' }}>{p.mrn}</div>}
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
            <label style={labelStyle}>Referir a *</label>
            <select value={toDoctorId} onChange={e => setToDoctorId(e.target.value)} required
              style={{ ...inputStyle }}>
              <option value="">Selecciona un médico...</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}{d.specialty ? ` — ${d.specialty}` : ''}</option>
              ))}
            </select>
            {doctors.length === 0 && <p style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 4 }}>No hay otros médicos activos en tu clínica.</p>}
          </div>

          {/* Priority */}
          <div>
            <label style={labelStyle}>Prioridad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['ROUTINE', 'URGENT', 'EMERGENCY'] as const).map(p => {
                const active = priority === p
                const as = PRIO_ACTIVE[p]
                return (
                  <button key={p} type="button" onClick={() => setPriority(p)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                    background: active ? as.bg : 'transparent',
                    color: active ? as.color : 'var(--mt-text-2)',
                    border: `1px solid ${active ? as.bg : 'var(--mt-border)'}`,
                  }}>
                    {PRIORITY_STYLES[p].label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label style={labelStyle}>Motivo de la referencia *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Describe el motivo clínico de la referencia..." rows={3} required
              style={{ ...inputStyle, height: 'auto', resize: 'none' }} />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notas adicionales</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional (opcional)..." rows={2}
              style={{ ...inputStyle, height: 'auto', resize: 'none' }} />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--mt-danger-subtle)', border: '1px solid #fecaca', borderRadius: 8 }}>
              <AlertTriangle size={14} color="var(--mt-danger)" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: 'var(--mt-danger)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <MTButton type="button" variant="outline" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</MTButton>
            <MTButton type="submit" variant="solid" icon={submitting ? Loader2 : Send} disabled={!canSubmit || submitting} style={{ flex: 1, justifyContent: 'center' }}>
              Enviar referencia
            </MTButton>
          </div>
        </form>
      </div>
    </div>
  )
}

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
    setLoading(true); setError(null)
    try { setReferrals(await listDoctorReferrals(token, tab)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error cargando referencias') }
    finally { setLoading(false) }
  }, [token, tab])

  useEffect(() => { load() }, [load])
  const pendingCount = referrals.filter(r => r.status === 'PENDING').length

  return (
    <ClinicalPage>
      {modalOpen && <NewReferralModal onClose={() => setModalOpen(false)} onCreated={() => { setTab('outgoing'); load() }} />}

      <ClinicalHeader
        title="Referencias médicas"
        subtitle="Envía y recibe referencias entre médicos de tu clínica"
        icon={ArrowUpDown}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <ClinicalButton icon={RefreshCw} variant="outline" tone="slate" onClick={load}>Actualizar</ClinicalButton>
            <ClinicalButton icon={Plus} variant="solid" tone="blue" onClick={() => setModalOpen(true)}>Nueva referencia</ClinicalButton>
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--mt-elevated)', borderRadius: 10, width: 'fit-content' }}>
        {([
          { key: 'incoming', label: 'Recibidas', icon: Inbox },
          { key: 'outgoing', label: 'Enviadas',  icon: Send  },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 7, border: 'none',
            background: tab === key ? 'var(--mt-surface)' : 'transparent',
            color: tab === key ? 'var(--mt-text)' : 'var(--mt-muted)',
            fontSize: 13, fontWeight: tab === key ? 500 : 400,
            cursor: 'pointer', transition: 'all .15s',
            boxShadow: tab === key ? 'var(--mt-shadow-sm)' : 'none',
          }}>
            <Icon size={15} />
            {label}
            {key === 'incoming' && pendingCount > 0 && !loading && (
              <span style={{ background: '#F59E0B', color: '#fff', fontSize: 11, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
            <AlertTriangle size={32} color="var(--mt-danger)" />
            <p style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>{error}</p>
            <ClinicalButton variant="outline" tone="slate" onClick={load}>Reintentar</ClinicalButton>
          </div>
        ) : referrals.length === 0 ? (
          <EmptyClinicalState
            icon={tab === 'incoming' ? Inbox : Send}
            title={tab === 'incoming' ? 'Sin referencias recibidas' : 'Sin referencias enviadas'}
            description={tab === 'incoming' ? 'Aquí aparecerán las referencias que otros médicos te envíen.' : 'Las referencias que envíes a otros médicos aparecerán aquí.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            {referrals.map(r => (
              <ReferralCard key={r.id} referral={r} isIncoming={tab === 'incoming'} onAction={load} />
            ))}
          </div>
        )}
      </ClinicalPanel>
    </ClinicalPage>
  )
}
