'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin,
  Plus, RefreshCw, Stethoscope, User, X, Check, AlertCircle,
  UserX, Loader2,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import {
  listAppointments, createAppointment, confirmAppointment,
  completeAppointment, noShowAppointment, cancelAppointment,
  type Appointment, type AppointmentType, type AppointmentStatus,
} from '@/lib/doctor/appointments-api'
import { listStaff, listPatients, type StaffMember, type Patient } from '@/lib/doctor/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<AppointmentType, string> = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP:    'Seguimiento',
  PROCEDURE:    'Procedimiento',
  CHECK_UP:     'Control',
  EMERGENCY:    'Urgencia',
  TELECONSULT:  'Teleconsulta',
}

const TYPE_OPTIONS: AppointmentType[] = [
  'CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'CHECK_UP', 'EMERGENCY', 'TELECONSULT',
]

const STATUS_CONFIG: Record<AppointmentStatus, { bg: string; fg: string; label: string; dot: string }> = {
  SCHEDULED:   { bg: '#eff6ff', fg: '#1d4ed8', label: 'Programada',   dot: '#3b82f6' },
  CONFIRMED:   { bg: '#f0fdf4', fg: '#15803d', label: 'Confirmada',   dot: '#22c55e' },
  IN_PROGRESS: { bg: '#fffbeb', fg: '#b45309', label: 'En consulta',  dot: '#f59e0b' },
  COMPLETED:   { bg: '#f8fafc', fg: '#475569', label: 'Completada',   dot: '#94a3b8' },
  CANCELLED:   { bg: '#fef2f2', fg: '#b91c1c', label: 'Cancelada',    dot: '#ef4444' },
  NO_SHOW:     { bg: '#fdf4ff', fg: '#7e22ce', label: 'No asistió',   dot: '#a855f7' },
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 07:00 – 19:00

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]!
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDate(d: Date) {
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
}

function calcAge(dob: string | null) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
}

function appointmentTop(iso: string): number {
  const d = new Date(iso)
  const minutesSince7 = (d.getHours() - 7) * 60 + d.getMinutes()
  return Math.max(0, minutesSince7)
}

function appointmentHeight(minutes: number): number {
  return minutes
}

// ─── Create Appointment Modal ─────────────────────────────────────────────────

type NewApptForm = {
  patient_id: string
  doctor_id: string
  scheduled_date: string
  scheduled_time: string
  duration_minutes: number
  type: AppointmentType
  reason: string
}

function CreateModal({
  initialDate,
  doctors,
  currentUserId,
  token,
  onClose,
  onCreated,
}: {
  initialDate: string
  doctors: StaffMember[]
  currentUserId: string
  token: string
  onClose: () => void
  onCreated: (a: Appointment) => void
}) {
  const [form, setForm] = useState<NewApptForm>({
    patient_id: '',
    doctor_id: currentUserId,
    scheduled_date: initialDate,
    scheduled_time: '09:00',
    duration_minutes: 30,
    type: 'CONSULTATION',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  useEffect(() => {
    if (patientSearch.length < 2) { setPatients([]); return }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await listPatients(token, patientSearch)
        setPatients(res.patients)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [patientSearch, token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.patient_id || !form.doctor_id) { setError('Selecciona paciente y doctor'); return }
    setSaving(true)
    setError('')
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`).toISOString()
      const appt = await createAppointment(token, form.patient_id, {
        patient_id:       form.patient_id,
        doctor_id:        form.doctor_id,
        scheduled_at,
        duration_minutes: form.duration_minutes,
        type:             form.type,
        reason:           form.reason || undefined,
      })
      onCreated(appt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cita')
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof NewApptForm>(k: K, v: NewApptForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const labelClass = 'text-xs font-semibold text-[var(--mt-text-2)] uppercase tracking-wide mb-1 block'
  const fieldClass = 'w-full rounded-xl border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 py-2 text-sm text-[var(--mt-text)] focus:outline-none focus:border-[var(--mt-primary)] transition-colors'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--mt-surface)', borderRadius: 18,
        width: '100%', maxWidth: 520,
        boxShadow: 'var(--mt-shadow-lg)',
        animation: 'mt-fade-scale-in .18s ease-out',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid var(--mt-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--mt-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--mt-primary-subtle)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarDays size={18} color="var(--mt-primary)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--mt-text)' }}>Nueva cita</h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-muted)' }}>{new Date(initialDate + 'T12:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--mt-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Patient search */}
          <div>
            <label className={labelClass}>Paciente *</label>
            {selectedPatient ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 12,
                border: '1px solid var(--mt-primary)', background: 'var(--mt-primary-subtle)',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)' }}>
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </p>
                  {selectedPatient.date_of_birth && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--mt-muted)' }}>
                      {calcAge(selectedPatient.date_of_birth)} años
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedPatient(null); set('patient_id', ''); setPatientSearch('') }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--mt-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  className={fieldClass}
                  placeholder="Buscar por nombre…"
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  autoComplete="off"
                />
                {(patients.length > 0 || searchLoading) && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
                    borderRadius: 12, marginTop: 4, boxShadow: 'var(--mt-shadow-lg)',
                    maxHeight: 200, overflowY: 'auto',
                  }}>
                    {searchLoading && (
                      <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--mt-muted)' }}>Buscando…</div>
                    )}
                    {patients.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPatient(p); set('patient_id', p.id); setPatients([]) }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '10px 14px',
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          fontSize: 13, color: 'var(--mt-text)',
                          borderBottom: '1px solid var(--mt-border)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                        {p.date_of_birth && (
                          <span style={{ color: 'var(--mt-muted)', marginLeft: 6 }}>{calcAge(p.date_of_birth)} años</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className={labelClass}>Doctor *</label>
            <select className={fieldClass} value={form.doctor_id} onChange={e => set('doctor_id', e.target.value)}>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}{d.specialty ? ` · ${d.specialty}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className={labelClass}>Fecha *</label>
              <input type="date" className={fieldClass} value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Hora *</label>
              <input type="time" className={fieldClass} value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)} required />
            </div>
          </div>

          {/* Duration + Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className={labelClass}>Duración (min)</label>
              <input type="number" min={5} max={480} step={5} className={fieldClass} value={form.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select className={fieldClass} value={form.type} onChange={e => set('type', e.target.value as AppointmentType)}>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className={labelClass}>Motivo de consulta</label>
            <input className={fieldClass} placeholder="Ej: Revisión de presión arterial" value={form.reason} onChange={e => set('reason', e.target.value)} maxLength={500} />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mt-danger)', background: 'var(--mt-danger-subtle)', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 18px', borderRadius: 10, border: '1px solid var(--mt-border)',
              background: 'var(--mt-surface)', fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', cursor: 'pointer',
            }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !form.patient_id} style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: form.patient_id ? 'var(--mt-primary)' : 'var(--mt-elevated)',
              color: form.patient_id ? '#fff' : 'var(--mt-muted)',
              fontSize: 13, fontWeight: 600, cursor: form.patient_id ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              Agendar cita
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Appointment Card ─────────────────────────────────────────────────────────

function ApptCard({
  appt, token, onUpdate,
}: {
  appt: Appointment
  token: string
  onUpdate: (a: Appointment) => void
}) {
  const s = STATUS_CONFIG[appt.status]
  const [acting, setAct] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  async function act(fn: () => Promise<Appointment>) {
    setAct(true)
    try { onUpdate(await fn()) } catch {} finally { setAct(false) }
  }

  const canAct = appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && appt.status !== 'NO_SHOW'

  return (
    <div style={{
      background: 'var(--mt-surface)',
      border: `1px solid ${s.dot}33`,
      borderLeft: `4px solid ${s.dot}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Row 1: time + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} color="var(--mt-muted)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mt-text)', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(appt.scheduled_at)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
            ({appt.duration_minutes} min)
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          background: s.bg, color: s.fg,
        }}>
          {s.label}
        </span>
      </div>

      {/* Row 2: patient */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--mt-primary-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={14} color="var(--mt-primary)" />
        </div>
        <div style={{ minWidth: 0 }}>
          <Link
            href={`/patients/${appt.patient_id}`}
            style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)', textDecoration: 'none' }}
          >
            {appt.patient.first_name} {appt.patient.last_name}
          </Link>
          {appt.patient.date_of_birth && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--mt-muted)' }}>
              {calcAge(appt.patient.date_of_birth)} años
              {appt.patient.sex ? ` · ${appt.patient.sex === 'male' ? 'M' : appt.patient.sex === 'female' ? 'F' : 'O'}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Type + reason */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Stethoscope size={12} color="var(--mt-muted)" />
        <span style={{ fontSize: 12.5, color: 'var(--mt-text-2)' }}>{TYPE_LABELS[appt.type]}</span>
        {appt.reason && (
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>· {appt.reason}</span>
        )}
      </div>

      {/* Location */}
      {appt.location && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={12} color="var(--mt-muted)" />
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{appt.location.name}</span>
        </div>
      )}

      {/* Actions */}
      {canAct && !showCancel && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
          {appt.status === 'SCHEDULED' && (
            <ActionBtn icon={Check} label="Confirmar" color="green" disabled={acting}
              onClick={() => act(() => confirmAppointment(token, appt.id))} />
          )}
          {(appt.status === 'SCHEDULED' || appt.status === 'CONFIRMED') && (
            <ActionBtn icon={Stethoscope} label="En consulta" color="amber" disabled={acting}
              onClick={() => act(() => (fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'}/appointments/${appt.id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(j => j.data)))} />
          )}
          {(appt.status === 'CONFIRMED' || appt.status === 'IN_PROGRESS') && (
            <ActionBtn icon={Check} label="Completar" color="blue" disabled={acting}
              onClick={() => act(() => completeAppointment(token, appt.id))} />
          )}
          <ActionBtn icon={UserX} label="No asistió" color="purple" disabled={acting}
            onClick={() => act(() => noShowAppointment(token, appt.id))} />
          <ActionBtn icon={X} label="Cancelar" color="red" disabled={acting}
            onClick={() => setShowCancel(true)} />
        </div>
      )}

      {/* Cancel form */}
      {showCancel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <input
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="Motivo de cancelación (opcional)"
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '8px 12px', fontSize: 12.5, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setShowCancel(false); setCancelReason('') }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', fontSize: 12, cursor: 'pointer', color: 'var(--mt-text-2)' }}
            >
              Volver
            </button>
            <button
              onClick={() => act(() => { setShowCancel(false); return cancelAppointment(token, appt.id, cancelReason || undefined) })}
              disabled={acting}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  icon: Icon, label, color, onClick, disabled,
}: {
  icon: React.ElementType
  label: string
  color: 'green' | 'blue' | 'amber' | 'red' | 'purple'
  onClick: () => void
  disabled?: boolean
}) {
  const colors = {
    green:  { bg: '#f0fdf4', fg: '#15803d', hover: '#dcfce7' },
    blue:   { bg: '#eff6ff', fg: '#1d4ed8', hover: '#dbeafe' },
    amber:  { bg: '#fffbeb', fg: '#b45309', hover: '#fef3c7' },
    red:    { bg: '#fef2f2', fg: '#b91c1c', hover: '#fee2e2' },
    purple: { bg: '#fdf4ff', fg: '#7e22ce', hover: '#f3e8ff' },
  }[color]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 7,
        border: `1px solid ${colors.fg}22`,
        background: colors.bg, color: colors.fg,
        fontSize: 11.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { token, user } = useAuth()
  const canWrite = hasPermission(user?.role, PERMISSIONS.APPOINTMENT_WRITE, user?.permissions)

  const [date, setDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [doctors, setDoctors] = useState<StaffMember[]>([])
  const [filterDoctor, setFilterDoctor] = useState<string>('all')

  const dateStr = toDateStr(date)

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const needDoctors = doctors.length === 0
      const [appts, staffRes] = await Promise.all([
        listAppointments(token, { from: dateStr, to: dateStr, limit: 200 }),
        needDoctors ? listStaff(token) : Promise.resolve(null),
      ])
      setAppointments(appts)
      if (staffRes) setDoctors(staffRes.staff)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token, dateStr, doctors])

  useEffect(() => { load() }, [load])

  function handleUpdate(updated: Appointment) {
    setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const filtered = filterDoctor === 'all'
    ? appointments
    : appointments.filter(a => a.doctor_id === filterDoctor)

  const today = toDateStr(new Date())
  const isToday = dateStr === today

  const counts = {
    total:     filtered.length,
    confirmed: filtered.filter(a => a.status === 'CONFIRMED').length,
    pending:   filtered.filter(a => a.status === 'SCHEDULED').length,
    completed: filtered.filter(a => a.status === 'COMPLETED').length,
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)' }}>
            Agenda
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
            {formatDate(date)}{isToday ? ' · Hoy' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => load(true)} disabled={refreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 10, border: '1px solid var(--mt-border)',
            background: 'var(--mt-surface)', fontSize: 13, color: 'var(--mt-text-2)', cursor: 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          {canWrite && (
            <button onClick={() => setShowCreate(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: 'var(--mt-primary)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <Plus size={15} />
              Nueva cita
            </button>
          )}
        </div>
      </div>

      {/* Date navigator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 20, background: 'var(--mt-surface)',
        border: '1px solid var(--mt-border)', borderRadius: 14, padding: '10px 14px',
        flexWrap: 'wrap',
      }}>
        <button onClick={() => setDate(d => addDays(d, -1))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--mt-text-2)', padding: 4, borderRadius: 6, display: 'flex' }}>
          <ChevronLeft size={18} />
        </button>

        {/* Day chips: -2 to +4 */}
        <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {Array.from({ length: 7 }, (_, i) => addDays(date, i - 2)).map(d => {
            const ds = toDateStr(d)
            const isSelected = ds === dateStr
            const isT = ds === today
            return (
              <button
                key={ds}
                onClick={() => setDate(d)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: isSelected ? 'var(--mt-primary)' : isT ? 'var(--mt-primary-subtle)' : 'transparent',
                  color: isSelected ? '#fff' : isT ? 'var(--mt-primary)' : 'var(--mt-text-2)',
                  minWidth: 44,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
                  {d.toLocaleDateString('es', { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>

        <button onClick={() => setDate(d => addDays(d, 1))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--mt-text-2)', padding: 4, borderRadius: 6, display: 'flex' }}>
          <ChevronRight size={18} />
        </button>

        <button
          onClick={() => setDate(new Date())}
          style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--mt-border)',
            background: isToday ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
            color: isToday ? 'var(--mt-primary)' : 'var(--mt-text-2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Hoy
        </button>
      </div>

      {/* Stats + doctor filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Stat chips */}
        {[
          { label: 'Total', value: counts.total, color: 'var(--mt-text)' },
          { label: 'Pendientes', value: counts.pending, color: '#1d4ed8' },
          { label: 'Confirmadas', value: counts.confirmed, color: '#15803d' },
          { label: 'Completadas', value: counts.completed, color: 'var(--mt-muted)' },
        ].map(chip => (
          <div key={chip.label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 999,
            background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
            fontSize: 12.5, color: 'var(--mt-text-2)',
          }}>
            <span style={{ fontWeight: 700, color: chip.color }}>{chip.value}</span>
            {chip.label}
          </div>
        ))}

        <div style={{ marginLeft: 'auto' }}>
          <select
            value={filterDoctor}
            onChange={e => setFilterDoctor(e.target.value)}
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8, padding: '6px 10px',
              fontSize: 12.5, color: 'var(--mt-text)', background: 'var(--mt-surface)', cursor: 'pointer',
            }}
          >
            <option value="all">Todos los doctores</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Appointment list */}
      {loading ? (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', margin: '0 auto 12px',
            border: '3px solid var(--mt-primary-mist)', borderTopColor: 'var(--mt-primary)',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mt-muted)' }}>Cargando agenda…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, margin: '0 auto 16px',
            background: 'var(--mt-primary-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CalendarDays size={24} color="var(--mt-primary)" />
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--mt-text)' }}>Sin citas para hoy</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--mt-muted)' }}>
            {canWrite ? 'Usa el botón "Nueva cita" para agendar.' : 'No hay citas programadas para esta fecha.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            .map(appt => (
              <ApptCard key={appt.id} appt={appt} token={token!} onUpdate={handleUpdate} />
            ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && token && (
        <CreateModal
          initialDate={dateStr}
          doctors={doctors}
          currentUserId={user?.id ?? ''}
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={appt => {
            setAppointments(prev => [...prev, appt])
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}
