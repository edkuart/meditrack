'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Thermometer,
} from 'lucide-react'
import { DoseCard } from '@/components/portal/DoseCard'
import { MTLogo } from '@/components/doctor/clinical-ui'
import { getSession, saveSession, clearSession, type PatientSession } from '@/lib/portal/session'
import {
  authMagicLink,
  confirmDose,
  getAdherence,
  getLabOrders,
  getTodayCheckIn,
  getTodayDoses,
  isUnauthorizedPortalError,
  submitCheckIn,
  type DoseEvent,
  type PatientCheckIn,
  type PatientCheckInInput,
  type PortalLabOrder,
} from '@/lib/portal/api'

type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

// ─────────────────────────────────────────────
// Mood face SVG (geometric)
// ─────────────────────────────────────────────
function MoodAvatar({ score }: { score: number }) {
  const happy = score >= 85
  const ok = score >= 60 && score < 85
  const tone = happy ? '#10b981' : ok ? '#0ea5e9' : '#f59e0b'
  const bg   = happy ? '#d1fae5' : ok ? '#e0f2fe'  : '#fef3c7'
  const mouth = happy
    ? 'M 32 56 Q 44 70 56 56'
    : ok
    ? 'M 32 60 L 56 60'
    : 'M 32 62 Q 44 52 56 62'

  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%',
      background: bg, boxShadow: '0 6px 18px rgba(15,23,42,.08)',
      flexShrink: 0,
    }}>
      <svg width="72" height="72" viewBox="0 0 88 88" style={{ display: 'block' }}>
        <circle cx="32" cy="40" r="3.5" fill={tone} />
        <circle cx="56" cy="40" r="3.5" fill={tone} />
        <path d={mouth} stroke={tone} strokeWidth="3" strokeLinecap="round" fill="none" />
        {happy && (
          <>
            <circle cx="22" cy="52" r="3" fill={tone} opacity="0.25" />
            <circle cx="66" cy="52" r="3" fill={tone} opacity="0.25" />
          </>
        )}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// Adherence ring card
// ─────────────────────────────────────────────
function AdherenceCard({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const circum = 2 * Math.PI * 24
  const dash = (pct / 100) * circum

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e40af 0%, #1a56db 100%)',
      color: '#fff', borderRadius: 14, padding: 16,
      boxShadow: '0 6px 18px rgba(26,86,219,.25)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 140, height: 140,
        borderRadius: '50%', border: '40px solid rgba(255,255,255,.08)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.7)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Adherencia de hoy
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>{confirmed}</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,.85)' }}>/ {total} dosis</span>
          </div>
        </div>

        {/* Ring */}
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${dash} ${circum}`}
              style={{ transition: 'stroke-dasharray .8s cubic-bezier(0,0,.2,1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
          }}>{pct}%</div>
        </div>
      </div>

      {total > confirmed && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
          {total - confirmed} dosis pendiente{total - confirmed > 1 ? 's' : ''} hoy
        </div>
      )}
    </div>
  )
}

const SYMPTOM_OPTIONS = ['Dolor', 'Náusea', 'Mareo', 'Cansancio', 'Tos', 'Sueño difícil']
const RED_FLAG_OPTIONS = ['Fiebre alta', 'Falta de aire', 'Dolor intenso', 'Sangrado', 'Vómitos persistentes', 'Reacción alérgica']

function ToggleChip({
  label,
  selected,
  onClick,
  tone = 'blue',
}: {
  label: string
  selected: boolean
  onClick: () => void
  tone?: 'blue' | 'red'
}) {
  const activeBg = tone === 'red' ? '#fef2f2' : 'var(--mt-primary-subtle)'
  const activeColor = tone === 'red' ? '#b91c1c' : 'var(--mt-primary)'
  const activeBorder = tone === 'red' ? '#fecaca' : '#bfdbfe'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 30,
        borderRadius: 999,
        border: `1px solid ${selected ? activeBorder : 'var(--mt-border)'}`,
        background: selected ? activeBg : '#fff',
        color: selected ? activeColor : 'var(--mt-text-2)',
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--mt-font)',
      }}
    >
      {label}
    </button>
  )
}

function CheckInCard({
  checkIn,
  onSubmit,
}: {
  checkIn: PatientCheckIn | null
  onSubmit: (input: PatientCheckInInput) => Promise<void>
}) {
  const [painScore, setPainScore] = useState(checkIn?.pain_score ?? 0)
  const [temperature, setTemperature] = useState(checkIn?.temperature_c ? String(checkIn.temperature_c) : '')
  const [symptoms, setSymptoms] = useState<string[]>(checkIn?.symptoms ?? [])
  const [redFlags, setRedFlags] = useState<string[]>(checkIn?.red_flags ?? [])
  const [showRedFlags, setShowRedFlags] = useState((checkIn?.red_flags ?? []).length > 0)
  const [medicationIssue, setMedicationIssue] = useState(checkIn?.medication_issue ?? false)
  const [mood, setMood] = useState<PatientCheckInInput['mood']>(checkIn?.mood ?? 'same')
  const [notes, setNotes] = useState(checkIn?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPainScore(checkIn?.pain_score ?? 0)
    setTemperature(checkIn?.temperature_c ? String(checkIn.temperature_c) : '')
    setSymptoms(checkIn?.symptoms ?? [])
    setRedFlags(checkIn?.red_flags ?? [])
    setShowRedFlags((checkIn?.red_flags ?? []).length > 0)
    setMedicationIssue(checkIn?.medication_issue ?? false)
    setMood(checkIn?.mood ?? 'same')
    setNotes(checkIn?.notes ?? '')
  }, [checkIn])

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter(item => item !== value) : [...list, value])
  }

  async function submit() {
    setSaving(true)
    setSaved(false)
    try {
      await onSubmit({
        pain_score: painScore,
        temperature_c: temperature ? Number(temperature) : null,
        symptoms,
        red_flags: redFlags,
        medication_issue: medicationIssue,
        mood,
        notes: notes.trim() || null,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const severity = checkIn?.severity
  const severityLabel = severity === 'ALERT' ? 'Requiere revisión' : severity === 'WATCH' ? 'En observación' : 'Estable'
  const severityColor = severity === 'ALERT' ? '#b91c1c' : severity === 'WATCH' ? '#b45309' : '#047857'
  const severityBg = severity === 'ALERT' ? '#fef2f2' : severity === 'WATCH' ? '#fffbeb' : '#ecfdf5'

  return (
    <section className="portal-card portal-checkin-card">
      <div className="portal-card-header">
        <div className="portal-card-title-row">
          <div className="portal-card-icon">
            <Activity size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 className="portal-card-title">
              ¿Cómo vas hoy?
            </h2>
            <p className="portal-card-subtitle">
              Reporte rápido para tu equipo médico
            </p>
          </div>
        </div>
        {checkIn && (
          <span style={{
            borderRadius: 999,
            background: severityBg,
            color: severityColor,
            padding: '5px 9px',
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {severityLabel}
          </span>
        )}
      </div>

      <div className="portal-checkin-vitals">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="portal-field-label">Dolor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={10}
              value={painScore}
              onChange={e => setPainScore(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <strong style={{ minWidth: 24, textAlign: 'right', color: 'var(--mt-text)' }}>{painScore}</strong>
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="portal-field-label">Temperatura</span>
          <div style={{ position: 'relative' }}>
            <Thermometer size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--mt-muted)' }} />
            <input
              inputMode="decimal"
              value={temperature}
              onChange={e => setTemperature(e.target.value.replace(',', '.'))}
              placeholder="37.0"
              className="portal-input"
              style={{ padding: '0 10px 0 31px' }}
            />
          </div>
        </label>
      </div>

      <div className="portal-section-tight">
        <div className="portal-field-label">Estado general</div>
        <div className="portal-chip-row">
          {[
            { value: 'better', label: 'Mejor' },
            { value: 'same', label: 'Igual' },
            { value: 'worse', label: 'Peor' },
          ].map(option => (
            <ToggleChip
              key={option.value}
              label={option.label}
              selected={mood === option.value}
              onClick={() => setMood(option.value as PatientCheckInInput['mood'])}
            />
          ))}
        </div>
      </div>

      <div className="portal-section-tight">
        <div className="portal-field-label">Síntomas</div>
        <div className="portal-chip-row">
          {SYMPTOM_OPTIONS.map(option => (
            <ToggleChip key={option} label={option} selected={symptoms.includes(option)} onClick={() => toggle(symptoms, option, setSymptoms)} />
          ))}
        </div>
      </div>

      <div className="portal-section-tight">
        <button
          type="button"
          onClick={() => setShowRedFlags(open => !open)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            border: 'none', background: 'transparent', padding: '2px 0 8px',
            fontSize: 12, fontWeight: 700, color: '#b91c1c',
            fontFamily: 'var(--mt-font)', textAlign: 'left',
          }}
        >
          <AlertTriangle size={13} />
          Señales de alarma
          <span style={{ marginLeft: 'auto', color: 'var(--mt-muted)', fontWeight: 600 }}>
            {redFlags.length > 0 ? `${redFlags.length}` : showRedFlags ? 'Ocultar' : 'Agregar'}
          </span>
        </button>
        {showRedFlags && (
          <div className="portal-chip-row">
            {RED_FLAG_OPTIONS.map(option => (
              <ToggleChip key={option} label={option} selected={redFlags.includes(option)} onClick={() => toggle(redFlags, option, setRedFlags)} tone="red" />
            ))}
          </div>
        )}
      </div>

      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 38,
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--mt-text-2)',
      }}>
        <input
          type="checkbox"
          checked={medicationIssue}
          onChange={e => setMedicationIssue(e.target.checked)}
        />
        Tuve problema para tomar un medicamento
      </label>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Nota opcional para tu equipo médico"
        style={{
          width: '100%',
          border: '1px solid var(--mt-border)',
          borderRadius: 10,
          padding: 10,
          fontSize: 13,
          resize: 'none',
          fontFamily: 'var(--mt-font)',
          marginBottom: 12,
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        style={{
          width: '100%',
          height: 42,
          border: 'none',
          borderRadius: 10,
          background: 'var(--mt-primary)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--mt-font)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: saving ? 0.75 : 1,
        }}
      >
        {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {checkIn ? 'Actualizar reporte' : 'Enviar reporte de hoy'}
      </button>
      {(saved || checkIn) && (
        <p style={{ margin: '9px 0 0', textAlign: 'center', color: '#047857', fontSize: 12, fontWeight: 600 }}>
          Reporte guardado para hoy
        </p>
      )}
    </section>
  )
}

const LAB_ORDER_LABELS: Record<string, string> = {
  PENDING: 'Solicitado',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Resultados listos',
  CANCELLED: 'Cancelado',
}

function LabOrdersCard({ orders }: { orders: PortalLabOrder[] }) {
  if (orders.length === 0) return null

  const latest = orders[0]
  const panels = Array.from(new Set(latest.results.map(result => result.panel_name))).filter(Boolean)
  const abnormalCount = latest.results.filter(result =>
    result.status === 'HIGH' ||
    result.status === 'LOW' ||
    result.status === 'CRITICAL_HIGH' ||
    result.status === 'CRITICAL_LOW',
  ).length
  const statusColor = latest.status === 'COMPLETED'
    ? '#047857'
    : latest.status === 'CANCELLED'
      ? '#64748b'
      : '#1a56db'
  const statusBg = latest.status === 'COMPLETED'
    ? '#ecfdf5'
    : latest.status === 'CANCELLED'
      ? '#f8fafc'
      : '#eff6ff'

  return (
    <details className="portal-card" style={{ overflow: 'hidden' }}>
      <summary style={{
        listStyle: 'none',
        cursor: 'pointer',
        padding: '13px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: '#eff6ff',
          color: '#1a56db',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <FlaskConical size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--mt-text)' }}>
              Laboratorios
            </h2>
            <span style={{
              borderRadius: 999,
              background: statusBg,
              color: statusColor,
              padding: '2px 7px',
              fontSize: 10.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {LAB_ORDER_LABELS[latest.status] ?? latest.status}
            </span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--mt-muted)' }}>
            {panels.length > 0 ? panels.slice(0, 2).join(', ') : `${latest.results.length} parámetro(s)`}
          </p>
        </div>
        <ChevronDown size={16} color="var(--mt-muted)" />
      </summary>

      <div style={{ borderTop: '1px solid var(--mt-border)', padding: '10px 14px 13px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.slice(0, 3).map(order => {
            const orderPanels = Array.from(new Set(order.results.map(result => result.panel_name))).filter(Boolean)
            return (
              <div key={order.id} style={{
                borderRadius: 10,
                background: 'var(--mt-bg)',
                border: '1px solid var(--mt-border)',
                padding: '9px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>
                      {orderPanels[0] ?? 'Orden de laboratorio'}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: 'var(--mt-muted)' }}>
                      {new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {order.results.length} parámetro(s)
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: order.status === 'COMPLETED' ? '#047857' : '#1a56db',
                  }}>
                    {LAB_ORDER_LABELS[order.status] ?? order.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {abnormalCount > 0 && (
          <p style={{ margin: '9px 0 0', fontSize: 12, color: '#b45309', lineHeight: 1.4 }}>
            Tu equipo médico revisará {abnormalCount} resultado(s) fuera de rango.
          </p>
        )}
      </div>
    </details>
  )
}

// ─────────────────────────────────────────────
// Portal content
// ─────────────────────────────────────────────
function PortalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [session, setSession] = useState<PatientSession | null>(null)
  const [doses, setDoses] = useState<DoseEvent[]>([])
  const [adherence, setAdherence] = useState<{ score: number; avatar_state: AvatarState } | null>(null)
  const [checkIn, setCheckIn] = useState<PatientCheckIn | null>(null)
  const [labOrders, setLabOrders] = useState<PortalLabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const urlToken = searchParams.get('token')
      const forceFreshSession = searchParams.get('fresh') === '1'
      try {
        if (forceFreshSession || urlToken) clearSession()
        if (urlToken) {
          const result = await authMagicLink(urlToken)
          const s: PatientSession = { token: result.session_token, patient: result.patient }
          saveSession(s)
          setSession(s)
        } else {
          const existing = getSession()
          if (!existing) {
            setError('Abre el enlace de acceso que te compartió tu equipo médico para entrar al portal.')
            setLoading(false)
            return
          }
          setSession(existing)
        }
      } catch {
        setError('El enlace es inválido o ya expiró. Pide a tu médico un nuevo acceso.')
        setLoading(false)
      }
    }
    init()
  }, [searchParams, router])

  const loadData = useCallback(async (token: string) => {
    try {
      const [dosesData, adherenceData] = await Promise.all([
        getTodayDoses(token),
        getAdherence(token),
      ])
      setDoses(dosesData)
      setAdherence(adherenceData)
      const checkInData = await getTodayCheckIn(token).catch(() => null)
      setCheckIn(checkInData)
      const labData = await getLabOrders(token).catch(() => [])
      setLabOrders(labData)
      if (window.location.search.includes('token=')) {
        window.history.replaceState({}, '', '/portal')
      }
    } catch (err) {
      if (isUnauthorizedPortalError(err)) {
        clearSession()
        setError('Tu enlace de acceso expiró o ya no es válido. Pide a tu equipo médico un nuevo enlace.')
        return
      }
      setError('No se pudo cargar tu información. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { if (session) loadData(session.token) }, [session, loadData])

  async function handleConfirm(doseId: string) {
    if (!session) return
    const updated = await confirmDose(session.token, doseId)
    setDoses(prev => prev.map(d => d.id === doseId ? { ...d, ...updated } : d))
    getAdherence(session.token).then(setAdherence).catch(() => {})
  }

  async function handleSubmitCheckIn(input: PatientCheckInInput) {
    if (!session) return
    const saved = await submitCheckIn(session.token, input)
    setCheckIn(saved)
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 300 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--mt-text)', marginBottom: 8 }}>Acceso no válido</p>
          <p style={{ fontSize: 14, color: 'var(--mt-text-2)' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
        <p style={{ fontSize: 14, color: 'var(--mt-muted)' }}>Cargando tu tratamiento...</p>
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = session?.patient.first_name ?? ''
  const patientName = `${session?.patient.first_name ?? ''} ${session?.patient.last_name ?? ''}`.trim()
  const confirmedToday = doses.filter(d => d.status === 'CONFIRMED').length
  const totalToday = doses.filter(d => d.status !== 'CANCELLED').length
  const score = adherence?.score ?? 70
  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <>
      {/* Topbar */}
      <header className="portal-topbar">
        <MTLogo size={15} />
        <div />
      </header>

      {/* Scrollable body */}
      <div className="portal-body mt-page-in mt-scroll">
        {/* Greeting + mood */}
        <div className="portal-hero">
          <div style={{ flex: 1 }}>
            <div className="mt-micro" style={{ color: 'var(--mt-muted)', marginBottom: 6 }}>{greeting}</div>
            <h1 className="portal-hero-title">
              {firstName},<br />
              {score >= 80 ? 'vas muy bien.' : score >= 60 ? 'sigue adelante.' : 'un paso a la vez.'}
            </h1>
          </div>
          <MoodAvatar score={score} />
        </div>

        <div className="portal-main-grid">
          <div className="portal-column">
            <AdherenceCard confirmed={confirmedToday} total={totalToday} />
            <CheckInCard checkIn={checkIn} onSubmit={handleSubmitCheckIn} />
          </div>

          <div className="portal-column">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -2 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>
                Dosis de hoy
              </h2>
              <span className="mt-small">{today}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
              {doses.length === 0 ? (
                <div className="portal-card" style={{ padding: '28px 22px', textAlign: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: 'var(--mt-success-subtle)',
                    color: 'var(--mt-success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <ShieldCheck size={22} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--mt-text)', margin: '0 0 4px' }}>
                    No hay dosis programadas para hoy
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>
                    Revisa tu tratamiento completo si tienes dudas.
                  </p>
                </div>
              ) : (
                doses.map(dose => (
                  <DoseCard key={dose.id} dose={dose} onConfirm={handleConfirm} />
                ))
              )}
            </div>

            <LabOrdersCard orders={labOrders} />

          </div>
        </div>

        <p style={{
          marginTop: 20, textAlign: 'center', fontSize: 12,
          color: 'var(--mt-muted)', lineHeight: 1.5,
        }}>
          Si algo no coincide con las indicaciones recibidas, consulta con tu equipo médico.
        </p>
      </div>
    </>
  )
}

export default function PortalPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
      </div>
    }>
      <PortalContent />
    </Suspense>
  )
}
