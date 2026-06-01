'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Flame,
  FlaskConical,
  Heart,
  Loader2,
  LogOut,
  Moon,
  Pill,
  Plus,
  ShieldCheck,
  Sparkles,
  Thermometer,
  X,
  Zap,
} from 'lucide-react'
import { DoseCard } from '@/components/portal/DoseCard'
import { MTLogo } from '@/components/doctor/clinical-ui'
import { getSession, saveSession, clearSession, type PatientSession } from '@/lib/portal/session'
import {
  authMagicLink,
  confirmDose,
  confirmAppointmentAttendance,
  getAdherence,
  getEngagement,
  getLabOrders,
  getPortalAppointments,
  getTodayCheckIn,
  getTodayDoses,
  isUnauthorizedPortalError,
  submitCheckIn,
  type CheckInAdherenceReport,
  type CheckInEnergyLevel,
  type CheckInSleepQuality,
  type CheckInTreatmentPerception,
  type DoseEvent,
  type PatientCheckIn,
  type PatientCheckInInput,
  type PatientEngagement,
  type PortalAppointment,
  type PortalLabOrder,
} from '@/lib/portal/api'

type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

// ─────────────────────────────────────────────
// Mood face SVG — 88px, soft halo
// ─────────────────────────────────────────────
function MoodAvatar({ score }: { score: number }) {
  const happy = score >= 85
  const ok = score >= 60 && score < 85
  const tone = happy ? '#059669' : ok ? '#0EA5E9' : '#D97706'
  const bg = happy ? '#D1FAE5' : ok ? '#E0F2FE' : '#FEF3C7'
  const mouth = happy
    ? 'M 32 56 Q 44 70 56 56'
    : ok
    ? 'M 32 60 L 56 60'
    : 'M 32 62 Q 44 52 56 62'

  return (
    <div
      style={{
        width: 88, height: 88, borderRadius: '50%',
        background: bg,
        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.10)',
        flexShrink: 0,
        position: 'relative',
      }}
      aria-hidden
    >
      <div style={{
        position: 'absolute', inset: -5,
        borderRadius: '50%',
        border: `1.5px solid ${bg}`,
        opacity: 0.55,
      }} />
      <svg width="88" height="88" viewBox="0 0 88 88" style={{ display: 'block' }}>
        <circle cx="32" cy="40" r="4" fill={tone} />
        <circle cx="56" cy="40" r="4" fill={tone} />
        <path d={mouth} stroke={tone} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        {happy && (
          <>
            <circle cx="20" cy="52" r="3" fill={tone} opacity="0.28" />
            <circle cx="68" cy="52" r="3" fill={tone} opacity="0.28" />
          </>
        )}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// Adherence card — hero stat with gradient + streak + 7-day dots
// ─────────────────────────────────────────────
function streakMilestone(days: number): string | null {
  if (days >= 30) return '🏆 Un mes'
  if (days >= 21) return '💪 21 días'
  if (days >= 14) return '⚡ 2 semanas'
  if (days >= 7) return '🔥 1 semana'
  return null
}

function AdherenceCard({
  confirmed,
  total,
  streakDays,
  customMessage,
  weekData,
}: {
  confirmed: number
  total: number
  streakDays?: number
  customMessage?: string | null
  weekData?: PatientEngagement['week']
}) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const circum = 2 * Math.PI * 26
  const dash = (pct / 100) * circum

  const message =
    customMessage ??
    (pct >= 80
      ? 'Excelente adherencia esta semana — sigue así.'
      : pct >= 60
      ? 'Buen progreso. Cada dosis te acerca a la meta.'
      : 'Vas bien. Cada dosis cuenta — un paso a la vez.')

  const pending = total - confirmed
  const todayStr = new Date().toISOString().split('T')[0]
  const milestone = typeof streakDays === 'number' ? streakMilestone(streakDays) : null

  return (
    <section className="portal-adherence-card" aria-label="Adherencia de hoy">
      {/* Top: figures + ring */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="portal-adherence-eyebrow">Adherencia de hoy</p>
          <div className="portal-adherence-figure">
            <span className="portal-adherence-figure-big">{confirmed}</span>
            <span className="portal-adherence-figure-sub">/ {total} dosis</span>
          </div>

          {/* Streak — prominent pill + milestone badge */}
          {typeof streakDays === 'number' && streakDays > 0 && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.18)', borderRadius: 999,
                padding: '5px 11px',
              }}>
                <Flame size={14} strokeWidth={2.5} />
                <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {streakDays}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
                  {streakDays === 1 ? 'día' : 'días'}
                </span>
              </div>
              {milestone && (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  background: 'rgba(255,255,255,0.22)',
                  borderRadius: 999, padding: '4px 9px',
                  letterSpacing: '0.01em',
                }}>
                  {milestone}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Circular progress */}
        <div style={{ position: 'relative', width: 68, height: 68, flexShrink: 0 }}>
          <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="34" cy="34" r="26" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="6" />
            <circle
              cx="34" cy="34" r="26"
              fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${dash} ${circum}`}
              style={{ transition: 'stroke-dasharray .8s cubic-bezier(0,0,.2,1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>{pct}%</div>
        </div>
      </div>

      <p className="portal-adherence-message">
        {pending > 0 && (
          <strong style={{ color: '#fff', fontWeight: 700 }}>
            Falta {pending} dosis pendiente{pending > 1 ? 's' : ''}.{' '}
          </strong>
        )}
        {message}
      </p>

      {/* 7-day dot strip */}
      {weekData && weekData.length > 0 && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {weekData.map(day => {
              const isToday = day.date === todayStr
              const isFuture = day.date > todayStr
              const hasScheduled = day.total > 0

              let dotBg: string
              if (isFuture || !hasScheduled) {
                dotBg = 'rgba(255,255,255,0.10)'
              } else if (day.score >= 75) {
                dotBg = '#fff'
              } else if (day.score > 0) {
                dotBg = 'rgba(255,255,255,0.50)'
              } else {
                dotBg = 'rgba(255,255,255,0.14)'
              }

              const shortDay = new Date(`${day.date}T12:00:00`).toLocaleDateString('es', { weekday: 'narrow' })

              return (
                <div key={day.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div
                    aria-label={`${shortDay}: ${hasScheduled ? `${day.confirmed} de ${day.total}` : 'sin dosis'}`}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: dotBg,
                      border: isToday ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
                      boxSizing: 'border-box',
                      transition: 'background 0.3s ease',
                    }}
                  />
                  <span style={{
                    fontSize: 10, fontWeight: isToday ? 900 : 600,
                    color: isToday ? '#fff' : 'rgba(255,255,255,0.50)',
                    textTransform: 'uppercase',
                  }}>
                    {shortDay}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────
// Shared chip
// ─────────────────────────────────────────────
function ToggleChip({
  label,
  selected,
  onClick,
  tone = 'blue',
}: {
  label: string
  selected: boolean
  onClick: () => void
  tone?: 'blue' | 'red' | 'amber'
}) {
  const styles = {
    blue:  { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',  border: 'var(--mt-primary-mist)' },
    red:   { bg: '#fff',                     color: '#B91C1C',             border: '#FECACA' },
    amber: { bg: '#FFFBEB',                  color: '#B45309',             border: '#FDE68A' },
  }
  const s = styles[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 34,
        borderRadius: 999,
        border: `1.5px solid ${selected ? s.border : 'var(--mt-border)'}`,
        background: selected ? s.bg : 'var(--mt-surface)',
        color: selected ? s.color : 'var(--mt-text-2)',
        padding: '6px 12px',
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: 'var(--mt-font)',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}

function painColor(value: number) {
  if (value <= 2) return '#059669'
  if (value <= 4) return '#84CC16'
  if (value <= 6) return '#F59E0B'
  if (value <= 8) return '#F97316'
  return '#DC2626'
}
function painLabel(value: number) {
  if (value === 0) return 'Sin dolor'
  if (value <= 3) return 'Leve'
  if (value <= 6) return 'Moderado'
  if (value <= 8) return 'Fuerte'
  return 'Intenso'
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SYMPTOM_OPTIONS = ['Dolor general', 'Náusea', 'Mareo', 'Cansancio', 'Tos', 'Sueño difícil']
const SIDE_EFFECT_OPTIONS = ['Náusea', 'Vómito', 'Mareo', 'Dolor de cabeza', 'Fatiga', 'Insomnio', 'Pérdida de apetito', 'Diarrea', 'Boca seca', 'Palpitaciones']
const RED_FLAG_OPTIONS = ['Fiebre alta', 'Falta de aire', 'Dolor intenso', 'Sangrado', 'Vómitos persistentes', 'Reacción alérgica']
const SKIP_REASONS = ['Se me olvidó', 'Efectos secundarios', 'Sin medicamento', 'Me sentí mejor', 'Otro motivo']

// ─────────────────────────────────────────────
// Collapsible symptom / side-effect panel
// ─────────────────────────────────────────────
function CollapsibleChipPanel({
  icon: Icon,
  iconColor,
  title,
  hint,
  hintColor,
  options,
  selected,
  onToggle,
  customItems,
  onAddCustom,
  onRemoveCustom,
  customInput,
  onCustomInputChange,
  tone,
  borderColor,
  bgColor,
  countBadgeActive,
}: {
  icon: React.ElementType
  iconColor: string
  title: string
  hint: string
  hintColor: string
  options: string[]
  selected: string[]
  onToggle: (val: string) => void
  customItems: string[]
  onAddCustom: () => void
  onRemoveCustom: (val: string) => void
  customInput: string
  onCustomInputChange: (val: string) => void
  tone: 'blue' | 'red' | 'amber'
  borderColor?: string
  bgColor?: string
  countBadgeActive?: { bg: string; color: string }
}) {
  const [open, setOpen] = useState(selected.length > 0 || customItems.length > 0)
  const total = selected.length + customItems.length
  const defaultBadge = { bg: 'var(--mt-elevated)', color: 'var(--mt-muted)' }
  const activeBadge = countBadgeActive ?? { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)' }

  return (
    <div className="portal-redflag-panel" style={{
      borderColor: borderColor ?? 'var(--mt-border)',
      background: bgColor ?? 'var(--mt-bg)',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="portal-redflag-toggle"
        style={{ color: 'var(--mt-text-2)' }}
        aria-expanded={open}
      >
        <Icon size={14} strokeWidth={2.5} style={{ color: iconColor }} />
        {title}
        <span className="portal-redflag-count" style={{
          background: total > 0 ? activeBadge.bg : defaultBadge.bg,
          color: total > 0 ? activeBadge.color : defaultBadge.color,
          border: '1px solid var(--mt-border)',
        }}>
          {total > 0 ? total : open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="portal-redflag-body">
          <p style={{ margin: '0 0 10px', fontSize: 12, color: hintColor, lineHeight: 1.45 }}>{hint}</p>
          <div className="portal-chip-row" style={{ marginBottom: customItems.length > 0 ? 10 : 0 }}>
            {options.map(opt => (
              <ToggleChip key={opt} label={opt} selected={selected.includes(opt)} onClick={() => onToggle(opt)} tone={tone} />
            ))}
          </div>
          {customItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {customItems.map(s => {
                const styles = tone === 'red'
                  ? { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' }
                  : tone === 'amber'
                  ? { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' }
                  : { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)', border: 'var(--mt-primary-mist)' }
                return (
                  <span key={s} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    borderRadius: 999, background: styles.bg, color: styles.color,
                    border: `1.5px solid ${styles.border}`, padding: '5px 10px',
                    fontSize: 12.5, fontWeight: 700,
                  }}>
                    {s}
                    <button type="button" onClick={() => onRemoveCustom(s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: styles.color, lineHeight: 1 }}
                      aria-label={`Eliminar ${s}`}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="text"
              value={customInput}
              onChange={e => onCustomInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddCustom() } }}
              placeholder="Agregar otro…"
              className="portal-input"
              style={{ flex: 1, height: 38 }}
            />
            <button type="button" onClick={onAddCustom}
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'var(--mt-primary)', color: '#fff',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
              aria-label="Agregar"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Check-in — 2-step progressive disclosure
// ─────────────────────────────────────────────
function CheckInCard({
  checkIn,
  onSubmit,
}: {
  checkIn: PatientCheckIn | null
  onSubmit: (input: PatientCheckInInput) => Promise<void>
}) {
  const allInitialSymptoms = checkIn?.symptoms ?? []
  const allInitialSideEffects = checkIn?.side_effects ?? []

  const [step, setStep] = useState<1 | 2>(1)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [mood, setMood] = useState<PatientCheckInInput['mood']>(checkIn?.mood ?? 'same')
  const [energyLevel, setEnergyLevel] = useState<CheckInEnergyLevel | null>(checkIn?.energy_level ?? null)
  const [adherenceReport, setAdherenceReport] = useState<CheckInAdherenceReport | null>(checkIn?.adherence_self_report ?? null)
  const [skipReason, setSkipReason] = useState<string>(checkIn?.adherence_skip_reason ?? '')
  const [painScore, setPainScore] = useState(checkIn?.pain_score ?? 0)
  const [temperature, setTemperature] = useState(checkIn?.temperature_c ? String(checkIn.temperature_c) : '')
  const [sleepQuality, setSleepQuality] = useState<CheckInSleepQuality | null>(checkIn?.sleep_quality ?? null)
  const [sideEffects, setSideEffects] = useState<string[]>(
    allInitialSideEffects.filter(s => SIDE_EFFECT_OPTIONS.includes(s))
  )
  const [customSideEffects, setCustomSideEffects] = useState<string[]>(
    allInitialSideEffects.filter(s => !SIDE_EFFECT_OPTIONS.includes(s))
  )
  const [customSideEffectInput, setCustomSideEffectInput] = useState('')
  const [symptoms, setSymptoms] = useState<string[]>(
    allInitialSymptoms.filter(s => SYMPTOM_OPTIONS.includes(s))
  )
  const [customSymptoms, setCustomSymptoms] = useState<string[]>(
    allInitialSymptoms.filter(s => !SYMPTOM_OPTIONS.includes(s))
  )
  const [customSymptomInput, setCustomSymptomInput] = useState('')
  const [redFlags, setRedFlags] = useState<string[]>(
    (checkIn?.red_flags ?? []).filter(r => RED_FLAG_OPTIONS.includes(r))
  )
  const [customRedFlags, setCustomRedFlags] = useState<string[]>(
    (checkIn?.red_flags ?? []).filter(r => !RED_FLAG_OPTIONS.includes(r))
  )
  const [customRedFlagInput, setCustomRedFlagInput] = useState('')
  const [treatmentPerception, setTreatmentPerception] = useState<CheckInTreatmentPerception | null>(checkIn?.treatment_perception ?? null)
  const [notes, setNotes] = useState(checkIn?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const allSymptoms = checkIn?.symptoms ?? []
    const allSideEffects = checkIn?.side_effects ?? []
    setStep(1)
    setDetailsOpen(false)
    setMood(checkIn?.mood ?? 'same')
    setEnergyLevel(checkIn?.energy_level ?? null)
    setAdherenceReport(checkIn?.adherence_self_report ?? null)
    setSkipReason(checkIn?.adherence_skip_reason ?? '')
    setPainScore(checkIn?.pain_score ?? 0)
    setTemperature(checkIn?.temperature_c ? String(checkIn.temperature_c) : '')
    setSleepQuality(checkIn?.sleep_quality ?? null)
    setSideEffects(allSideEffects.filter(s => SIDE_EFFECT_OPTIONS.includes(s)))
    setCustomSideEffects(allSideEffects.filter(s => !SIDE_EFFECT_OPTIONS.includes(s)))
    setSymptoms(allSymptoms.filter(s => SYMPTOM_OPTIONS.includes(s)))
    setCustomSymptoms(allSymptoms.filter(s => !SYMPTOM_OPTIONS.includes(s)))
    const allRedFlags = checkIn?.red_flags ?? []
    setRedFlags(allRedFlags.filter(r => RED_FLAG_OPTIONS.includes(r)))
    setCustomRedFlags(allRedFlags.filter(r => !RED_FLAG_OPTIONS.includes(r)))
    setTreatmentPerception(checkIn?.treatment_perception ?? null)
    setNotes(checkIn?.notes ?? '')
  }, [checkIn])

  function toggleList(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter(i => i !== value) : [...list, value])
  }

  function addCustom(
    input: string,
    predefined: string[],
    custom: string[],
    setCustom: (v: string[]) => void,
    setInput: (v: string) => void,
  ) {
    const val = input.trim()
    if (!val || custom.includes(val) || predefined.includes(val)) return
    setCustom([...custom, val])
    setInput('')
  }

  async function submit() {
    setSaving(true)
    setSaved(false)
    try {
      await onSubmit({
        mood,
        energy_level: energyLevel,
        adherence_self_report: adherenceReport,
        adherence_skip_reason: adherenceReport !== 'all' ? skipReason || null : null,
        pain_score: painScore,
        temperature_c: temperature ? Number(temperature) : null,
        sleep_quality: sleepQuality,
        side_effects: [...sideEffects, ...customSideEffects],
        symptoms: [...symptoms, ...customSymptoms],
        red_flags: [...redFlags, ...customRedFlags],
        medication_issue: adherenceReport === 'some' || adherenceReport === 'none',
        treatment_perception: treatmentPerception,
        notes: notes.trim() || null,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const severity = checkIn?.severity
  const severityLabel = severity === 'ALERT' ? 'Requiere revisión' : severity === 'WATCH' ? 'En observación' : 'Estable'
  const severityColor = severity === 'ALERT' ? '#B91C1C' : severity === 'WATCH' ? '#B45309' : '#047857'
  const severityBg = severity === 'ALERT' ? 'var(--mt-danger-subtle)' : severity === 'WATCH' ? '#FFFBEB' : 'var(--mt-success-subtle)'

  const adherenceConfig: Record<CheckInAdherenceReport, { label: string; color: string; bg: string; border: string }> = {
    all:  { label: '✅ Todos',       color: '#047857', bg: '#D1FAE5', border: '#6EE7B7' },
    most: { label: '~ La mayoría',  color: 'var(--mt-primary)', bg: 'var(--mt-primary-subtle)', border: 'var(--mt-primary-mist)' },
    some: { label: '⚠ Algunos',    color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
    none: { label: '✗ Ninguno',    color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  }

  const totalDetailCount =
    (energyLevel ? 1 : 0) +
    (sleepQuality ? 1 : 0) +
    (temperature ? 1 : 0) +
    sideEffects.length + customSideEffects.length +
    symptoms.length + customSymptoms.length +
    (treatmentPerception ? 1 : 0) +
    (notes.trim() ? 1 : 0)

  return (
    <section className="portal-card portal-checkin-card">
      {/* Header */}
      <div className="portal-card-header">
        <div className="portal-card-title-row">
          <div className="portal-card-icon"><Activity size={18} /></div>
          <div style={{ minWidth: 0 }}>
            <h2 className="portal-card-title">¿Cómo te sientes hoy?</h2>
            <p className="portal-card-subtitle">
              Reporte diario · Paso {step} de 2
            </p>
          </div>
        </div>
        {checkIn && step === 1 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            borderRadius: 999, background: 'var(--mt-success-subtle)', color: '#047857',
            padding: '5px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
            border: '1px solid #6EE7B733', flexShrink: 0,
          }}>
            <CheckCircle2 size={11} strokeWidth={2.5} />
            Enviado
          </span>
        )}
        {checkIn && step === 2 && (
          <span style={{
            borderRadius: 999, background: severityBg, color: severityColor,
            padding: '5px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
            border: `1px solid ${severityColor}22`, flexShrink: 0,
          }}>
            {severityLabel}
          </span>
        )}
      </div>

      {step === 1 ? (
        <>
          {/* ① Ánimo */}
          <div className="portal-section-tight">
            <div className="portal-field-label">Estado de ánimo</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'better', label: '🙂 Mejor' },
                { value: 'same',   label: '😐 Igual' },
                { value: 'worse',  label: '😕 Peor' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMood(opt.value as PatientCheckInInput['mood'])}
                  aria-pressed={mood === opt.value}
                  style={{
                    flex: 1, borderRadius: 12,
                    border: `1.5px solid ${mood === opt.value ? 'var(--mt-primary-mist)' : 'var(--mt-border)'}`,
                    background: mood === opt.value ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
                    color: mood === opt.value ? 'var(--mt-primary)' : 'var(--mt-text-2)',
                    padding: '12px 6px', fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--mt-font)', cursor: 'pointer',
                    transition: 'all 0.15s ease', textAlign: 'center',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ② Adherencia */}
          <div style={{
            borderRadius: 14, border: '1.5px solid var(--mt-border)',
            background: 'var(--mt-bg)', padding: '14px',
            marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Pill size={15} strokeWidth={2.5} color="var(--mt-primary)" />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--mt-text)' }}>
                ¿Tomaste todos tus medicamentos?
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(adherenceConfig) as [CheckInAdherenceReport, typeof adherenceConfig[CheckInAdherenceReport]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAdherenceReport(prev => prev === key ? null : key)}
                  aria-pressed={adherenceReport === key}
                  style={{
                    borderRadius: 12, border: `1.5px solid ${adherenceReport === key ? cfg.border : 'var(--mt-border)'}`,
                    background: adherenceReport === key ? cfg.bg : 'var(--mt-surface)',
                    color: adherenceReport === key ? cfg.color : 'var(--mt-text-2)',
                    padding: '10px 8px', fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--mt-font)', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            {adherenceReport && adherenceReport !== 'all' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--mt-text-2)', marginBottom: 8, fontWeight: 600 }}>
                  ¿Por qué no los tomaste todos?
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SKIP_REASONS.map(reason => (
                    <ToggleChip
                      key={reason}
                      label={reason}
                      selected={skipReason === reason}
                      onClick={() => setSkipReason(prev => prev === reason ? '' : reason)}
                      tone="amber"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ③ Dolor NRS */}
          <div className="portal-section-tight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="portal-field-label" style={{ margin: 0 }}>Dolor</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: painColor(painScore) }}>
                {painLabel(painScore)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range" min={0} max={10} value={painScore}
                onChange={e => setPainScore(Number(e.target.value))}
                className="portal-pain-slider"
                aria-label="Nivel de dolor de 0 a 10"
              />
              <span className="portal-pain-bubble" style={{ background: painColor(painScore) }} aria-hidden>
                {painScore}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--mt-muted)', fontWeight: 600 }}>
              <span>Sin dolor</span><span>Insoportable</span>
            </div>
          </div>

          {/* Siguiente */}
          <button
            type="button"
            onClick={() => setStep(2)}
            className="portal-confirm-btn"
            style={{ marginTop: 4 }}
          >
            Continuar →
          </button>
        </>
      ) : (
        <>
          {/* Back */}
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--mt-text-2)', fontSize: 12.5, fontWeight: 700,
              fontFamily: 'var(--mt-font)', padding: '0 0 12px', marginTop: -4,
            }}
          >
            ← Atrás
          </button>

          {/* ④ Señales de alarma — siempre visible */}
          <div style={{
            borderRadius: 14, border: '1.5px solid #FECACA',
            background: '#FEF2F2', padding: '14px', marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={14} strokeWidth={2.5} style={{ color: '#B91C1C', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#991B1B' }}>Señales de alarma</span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#7F1D1D', lineHeight: 1.45 }}>
              Marca solo si estás experimentando algo de esto ahora mismo.
            </p>
            <div className="portal-chip-row" style={{ marginBottom: customRedFlags.length > 0 ? 10 : 0 }}>
              {RED_FLAG_OPTIONS.map(opt => (
                <ToggleChip
                  key={opt} label={opt}
                  selected={redFlags.includes(opt)}
                  onClick={() => toggleList(redFlags, opt, setRedFlags)}
                  tone="red"
                />
              ))}
            </div>
            {customRedFlags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {customRedFlags.map(s => (
                  <span key={s} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    borderRadius: 999, background: '#FEF2F2', color: '#B91C1C',
                    border: '1.5px solid #FECACA', padding: '5px 10px',
                    fontSize: 12.5, fontWeight: 700,
                  }}>
                    {s}
                    <button type="button" onClick={() => setCustomRedFlags(prev => prev.filter(x => x !== s))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#B91C1C', lineHeight: 1 }}
                      aria-label={`Eliminar ${s}`}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={customRedFlagInput}
                onChange={e => setCustomRedFlagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(customRedFlagInput, RED_FLAG_OPTIONS, customRedFlags, setCustomRedFlags, setCustomRedFlagInput) } }}
                placeholder="Agregar otra señal…"
                className="portal-input"
                style={{ flex: 1, height: 38 }}
              />
              <button type="button"
                onClick={() => addCustom(customRedFlagInput, RED_FLAG_OPTIONS, customRedFlags, setCustomRedFlags, setCustomRedFlagInput)}
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: '#B91C1C', color: '#fff',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
                aria-label="Agregar"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* ⑤ Detalles opcionales — colapsable */}
          <button
            type="button"
            onClick={() => setDetailsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderRadius: 12, border: '1.5px solid var(--mt-border)',
              background: 'var(--mt-surface)', padding: '11px 14px',
              cursor: 'pointer', fontFamily: 'var(--mt-font)', marginBottom: 4,
            }}
            aria-expanded={detailsOpen}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--mt-text-2)' }}>
              <Sparkles size={13} strokeWidth={2.5} style={{ color: 'var(--mt-primary)' }} />
              Agregar detalles opcionales
              {totalDetailCount > 0 && (
                <span style={{
                  borderRadius: 999, background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',
                  border: '1px solid var(--mt-primary-mist)', padding: '1px 7px', fontSize: 11, fontWeight: 800,
                }}>
                  {totalDetailCount}
                </span>
              )}
            </span>
            <ChevronDown
              size={16}
              color="var(--mt-muted)"
              style={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
            />
          </button>

          {detailsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Energía + Sueño */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4, padding: '4px 0' }}>
                <div className="portal-section-tight" style={{ marginBottom: 0 }}>
                  <div className="portal-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Zap size={12} strokeWidth={2.5} />
                    Energía
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { value: 'low',    label: '🪫 Cansado/a' },
                      { value: 'normal', label: '— Normal' },
                      { value: 'high',   label: '⚡ Con energía' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEnergyLevel(prev => prev === opt.value ? null : opt.value)}
                        aria-pressed={energyLevel === opt.value}
                        style={{
                          borderRadius: 10,
                          border: `1.5px solid ${energyLevel === opt.value ? (opt.value === 'low' ? '#FDE68A' : 'var(--mt-primary-mist)') : 'var(--mt-border)'}`,
                          background: energyLevel === opt.value ? (opt.value === 'low' ? '#FFFBEB' : 'var(--mt-primary-subtle)') : 'var(--mt-surface)',
                          color: energyLevel === opt.value ? (opt.value === 'low' ? '#B45309' : 'var(--mt-primary)') : 'var(--mt-text-2)',
                          padding: '8px 10px', fontSize: 13, fontWeight: 700,
                          fontFamily: 'var(--mt-font)', cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="portal-section-tight" style={{ marginBottom: 0 }}>
                  <div className="portal-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Moon size={12} strokeWidth={2.5} />
                    Sueño
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { value: 'poor', label: '😴 Malo' },
                      { value: 'fair', label: '— Regular' },
                      { value: 'good', label: '💤 Bueno' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSleepQuality(prev => prev === opt.value ? null : opt.value)}
                        aria-pressed={sleepQuality === opt.value}
                        style={{
                          borderRadius: 10,
                          border: `1.5px solid ${sleepQuality === opt.value ? (opt.value === 'poor' ? '#FDE68A' : 'var(--mt-primary-mist)') : 'var(--mt-border)'}`,
                          background: sleepQuality === opt.value ? (opt.value === 'poor' ? '#FFFBEB' : 'var(--mt-primary-subtle)') : 'var(--mt-surface)',
                          color: sleepQuality === opt.value ? (opt.value === 'poor' ? '#B45309' : 'var(--mt-primary)') : 'var(--mt-text-2)',
                          padding: '8px 10px', fontSize: 13, fontWeight: 700,
                          fontFamily: 'var(--mt-font)', cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Temperatura */}
              <div className="portal-section-tight">
                <label style={{ display: 'block' }}>
                  <span className="portal-field-label">Temperatura (opcional)</span>
                  <div style={{ position: 'relative' }}>
                    <Thermometer size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--mt-muted)' }} />
                    <input
                      inputMode="decimal"
                      value={temperature}
                      onChange={e => setTemperature(e.target.value.replace(',', '.'))}
                      placeholder="37.0 °C"
                      className="portal-input"
                      style={{ padding: '0 12px 0 34px' }}
                    />
                  </div>
                </label>
              </div>

              {/* Efectos secundarios */}
              <CollapsibleChipPanel
                icon={Zap}
                iconColor="#B45309"
                title="Efectos secundarios"
                hint="Marca si notaste algo relacionado con tus medicamentos."
                hintColor="#92400E"
                options={SIDE_EFFECT_OPTIONS}
                selected={sideEffects}
                onToggle={val => toggleList(sideEffects, val, setSideEffects)}
                customItems={customSideEffects}
                onAddCustom={() => addCustom(customSideEffectInput, SIDE_EFFECT_OPTIONS, customSideEffects, setCustomSideEffects, setCustomSideEffectInput)}
                onRemoveCustom={val => setCustomSideEffects(prev => prev.filter(x => x !== val))}
                customInput={customSideEffectInput}
                onCustomInputChange={setCustomSideEffectInput}
                tone="amber"
                borderColor="#FDE68A"
                bgColor="#FFFBEB"
                countBadgeActive={{ bg: '#FEF3C7', color: '#B45309' }}
              />

              {/* Síntomas generales */}
              <CollapsibleChipPanel
                icon={Activity}
                iconColor="var(--mt-primary)"
                title="Síntomas generales"
                hint="Marca los que apliquen hoy."
                hintColor="var(--mt-text-2)"
                options={SYMPTOM_OPTIONS}
                selected={symptoms}
                onToggle={val => toggleList(symptoms, val, setSymptoms)}
                customItems={customSymptoms}
                onAddCustom={() => addCustom(customSymptomInput, SYMPTOM_OPTIONS, customSymptoms, setCustomSymptoms, setCustomSymptomInput)}
                onRemoveCustom={val => setCustomSymptoms(prev => prev.filter(x => x !== val))}
                customInput={customSymptomInput}
                onCustomInputChange={setCustomSymptomInput}
                tone="blue"
              />

              {/* Percepción del tratamiento */}
              <div className="portal-section-tight">
                <div className="portal-field-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Heart size={12} strokeWidth={2.5} />
                  ¿Sientes que el tratamiento te está ayudando?
                </div>
                <div className="portal-chip-row">
                  {([
                    { value: 'better', label: '💚 Noto mejoría' },
                    { value: 'same',   label: '— Igual que antes' },
                    { value: 'worse',  label: '⬇ Me siento peor' },
                  ] as const).map(opt => (
                    <ToggleChip
                      key={opt.value}
                      label={opt.label}
                      selected={treatmentPerception === opt.value}
                      onClick={() => setTreatmentPerception(prev => prev === opt.value ? null : opt.value)}
                      tone={opt.value === 'worse' ? 'red' : 'blue'}
                    />
                  ))}
                </div>
              </div>

              {/* Notas libres */}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="¿Algo más que quieras contarle a tu equipo médico? (opcional)"
                style={{
                  width: '100%', border: '1px solid var(--mt-border)', borderRadius: 12,
                  padding: '10px 12px', fontSize: 13.5, resize: 'none',
                  fontFamily: 'var(--mt-font)', marginBottom: 4,
                  background: 'var(--mt-surface)', color: 'var(--mt-text)',
                }}
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="portal-confirm-btn"
            style={{ marginTop: 4 }}
          >
            {saving ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Enviando…</>
            ) : (
              <><Sparkles size={18} strokeWidth={2.5} />{checkIn ? 'Actualizar reporte' : 'Enviar reporte de hoy'}</>
            )}
          </button>

          {(saved || checkIn) && (
            <p style={{ margin: '10px 0 0', textAlign: 'center', color: '#047857', fontSize: 12.5, fontWeight: 700 }}>
              Reporte guardado para hoy
            </p>
          )}
        </>
      )}
    </section>
  )
}


// ─────────────────────────────────────────────
// Appointment type / status labels
// ─────────────────────────────────────────────
const APPT_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP: 'Control',
  PROCEDURE: 'Procedimiento',
  CHECK_UP: 'Chequeo',
  EMERGENCY: 'Urgencia',
  TELECONSULT: 'Teleconsulta',
}


function apptChipLabel(isoString: string) {
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
    day = date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
    day = day.charAt(0).toUpperCase() + day.slice(1)
  }
  return { label: `${day} · ${time}`, isToday }
}

function NextAppointmentCard({
  appointments,
  onConfirm,
}: {
  appointments: { upcoming: PortalAppointment[]; past: PortalAppointment[] } | null
  onConfirm: (id: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  if (!appointments) return null
  const next = appointments.upcoming.find(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
  if (!next) return null

  const { label: chipLabel, isToday } = apptChipLabel(next.scheduled_at)
  const canConfirm = next.status === 'SCHEDULED'
  const isConfirmed = next.status === 'CONFIRMED'

  async function handleConfirm() {
    setConfirming(true)
    try { await onConfirm(next!.id) } finally { setConfirming(false) }
  }

  return (
    <article
      className="portal-dose-card"
      style={{ borderColor: isToday ? '#FDE68A' : '#C7D2FE' }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon — same size/shape as Pill icon in DoseCard */}
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: isToday ? '#FEF3C7' : 'var(--mt-primary-subtle)',
          border: `1.5px solid ${isToday ? '#FDE68A' : 'var(--mt-primary-mist)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isToday ? '#B45309' : 'var(--mt-primary)',
        }}>
          <CalendarDays size={22} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Doctor name — same typography as drug name */}
          <h3 style={{
            margin: 0, fontSize: 16.5, fontWeight: 800,
            color: 'var(--mt-text)', letterSpacing: '-0.015em', lineHeight: 1.2,
          }}>
            Dr. {next.doctor.first_name} {next.doctor.last_name}
          </h3>
          {next.doctor.specialty && (
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--mt-text-2)' }}>
              {next.doctor.specialty}
            </p>
          )}

          {/* Date chip + meta — same row as time chip + period label */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="portal-time-chip"
              style={{
                background: isToday ? '#FEF3C7' : 'var(--mt-primary-subtle)',
                color: isToday ? '#B45309' : 'var(--mt-primary)',
              }}
            >
              <CalendarDays size={13} strokeWidth={2.5} />
              {chipLabel}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--mt-muted)', fontWeight: 500 }}>
              {next.duration_minutes} min
            </span>
            <span className="portal-food-chip" style={{ background: 'var(--mt-elevated)', color: 'var(--mt-text-2)', border: 'none' }}>
              {APPT_TYPE_LABELS[next.type] ?? next.type}
            </span>
          </div>
        </div>
      </header>

      {/* Location + reason — same indent as dose amount */}
      {(next.location || next.reason) && (
        <div style={{ marginTop: 10, paddingLeft: 60, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {next.location && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.4 }}>
              📍 {next.location.name}{next.location.address ? ` · ${next.location.address}` : ''}
            </p>
          )}
          {next.reason && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mt-text-2)', fontStyle: 'italic', lineHeight: 1.4 }}>
              "{next.reason}"
            </p>
          )}
        </div>
      )}

      {/* Confirmed strip — mirrors portal-confirm-strip */}
      {isConfirmed && (
        <div className="portal-confirm-strip" style={{ background: 'var(--mt-success-subtle)', borderColor: '#A7F3D0' }}>
          <span className="portal-confirm-strip-icon" style={{ background: '#A7F3D0', color: '#047857' }}>
            <CheckCircle2 size={17} strokeWidth={3} />
          </span>
          <div style={{ color: 'var(--mt-text)' }}>
            <strong>Asistencia confirmada.</strong> Tu médico ya sabe que vas a asistir.
          </div>
        </div>
      )}

      {/* Confirm button — flagship portal-confirm-btn, green variant */}
      {canConfirm && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          className="portal-confirm-btn"
          style={{
            background: '#047857',
            boxShadow: '0 4px 14px rgba(4,120,87,0.30), 0 1px 2px rgba(4,120,87,0.15)',
          }}
        >
          {confirming ? (
            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />Confirmando…</>
          ) : (
            <><CheckCircle2 size={18} strokeWidth={2.5} />Confirmar asistencia</>
          )}
        </button>
      )}
    </article>
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
  const panels = Array.from(new Set(latest.results.map(r => r.panel_name))).filter(Boolean)
  const abnormalCount = latest.results.filter(r =>
    r.status === 'HIGH' || r.status === 'LOW' || r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW',
  ).length
  const statusColor = latest.status === 'COMPLETED' ? '#047857' : latest.status === 'CANCELLED' ? 'var(--mt-muted)' : 'var(--mt-primary)'
  const statusBg = latest.status === 'COMPLETED' ? 'var(--mt-success-subtle)' : latest.status === 'CANCELLED' ? 'var(--mt-elevated)' : 'var(--mt-primary-subtle)'

  return (
    <details className="portal-card" style={{ overflow: 'hidden' }}>
      <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--mt-primary-subtle)',
          color: 'var(--mt-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <FlaskConical size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--mt-text)' }}>Laboratorios</h2>
            <span style={{ borderRadius: 999, background: statusBg, color: statusColor, padding: '2px 8px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {LAB_ORDER_LABELS[latest.status] ?? latest.status}
            </span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--mt-muted)' }}>
            {panels.length > 0 ? panels.slice(0, 2).join(', ') : `${latest.results.length} parámetro(s)`}
          </p>
        </div>
        <ChevronDown size={16} color="var(--mt-muted)" />
      </summary>
      <div style={{ borderTop: '1px solid var(--mt-border)', padding: '10px 14px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.slice(0, 3).map(order => {
            const orderPanels = Array.from(new Set(order.results.map(r => r.panel_name))).filter(Boolean)
            return (
              <div key={order.id} style={{ borderRadius: 12, background: 'var(--mt-bg)', border: '1px solid var(--mt-border)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mt-text)' }}>{orderPanels[0] ?? 'Orden de laboratorio'}</div>
                    <div style={{ marginTop: 2, fontSize: 12, color: 'var(--mt-muted)' }}>
                      {new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {order.results.length} parámetro(s)
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: order.status === 'COMPLETED' ? '#047857' : 'var(--mt-primary)' }}>
                    {LAB_ORDER_LABELS[order.status] ?? order.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {abnormalCount > 0 && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#B45309', lineHeight: 1.4 }}>
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
  const [engagement, setEngagement] = useState<PatientEngagement | null>(null)
  const [checkIn, setCheckIn] = useState<PatientCheckIn | null>(null)
  const [labOrders, setLabOrders] = useState<PortalLabOrder[]>([])
  const [portalAppointments, setPortalAppointments] = useState<{ upcoming: PortalAppointment[]; past: PortalAppointment[] } | null>(null)
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
      const [dosesData, adherenceData] = await Promise.all([getTodayDoses(token), getAdherence(token)])
      setDoses(dosesData)
      setAdherence(adherenceData)
      getEngagement(token).then(setEngagement).catch(() => setEngagement(null))
      const checkInData = await getTodayCheckIn(token).catch(() => null)
      setCheckIn(checkInData)
      const labData = await getLabOrders(token).catch(() => [])
      setLabOrders(labData)
      getPortalAppointments(token).then(setPortalAppointments).catch(() => setPortalAppointments(null))
      if (window.location.search.includes('token=')) window.history.replaceState({}, '', '/portal')
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
    getEngagement(session.token).then(setEngagement).catch(() => {})
  }

  async function handleSubmitCheckIn(input: PatientCheckInInput) {
    if (!session) return
    const saved = await submitCheckIn(session.token, input)
    setCheckIn(saved)
  }

  async function handleConfirmAttendance(appointmentId: string) {
    if (!session) return
    const updated = await confirmAppointmentAttendance(session.token, appointmentId)
    setPortalAppointments(prev => {
      if (!prev) return prev
      return {
        ...prev,
        upcoming: prev.upcoming.map(a => a.id === updated.id ? { ...a, status: updated.status } : a),
      }
    })
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ margin: '0 auto 14px', width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFBEB', color: '#B45309' }}>
            <AlertTriangle size={26} />
          </div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--mt-text)', marginBottom: 6 }}>Acceso no válido</p>
          <p style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.5 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
        <p style={{ fontSize: 13.5, color: 'var(--mt-muted)' }}>Cargando tu tratamiento…</p>
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = session?.patient.first_name ?? ''
  const confirmedToday = doses.filter(d => d.status === 'CONFIRMED').length
  const totalToday = doses.filter(d => d.status !== 'CANCELLED').length
  const score = adherence?.score ?? engagement?.score ?? 70
  const dailyScore = totalToday > 0 ? Math.round((confirmedToday / totalToday) * 100) : 100
  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })

  const nextDose = doses
    .filter(d => d.status === 'PENDING')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]
  const nextDoseTime = nextDose
    ? new Date(nextDose.scheduled_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : null

  const heroLine = score >= 80 ? 'vas muy bien.' : score >= 60 ? 'sigue adelante.' : 'un paso a la vez.'

  return (
    <>
      <header className="portal-topbar">
        <MTLogo size={15} />
        <button
          type="button"
          onClick={() => { clearSession(); router.replace('/portal') }}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--mt-muted)', fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--mt-font)', padding: '6px 8px', borderRadius: 8,
          }}
        >
          <LogOut size={14} strokeWidth={2.2} />
          Salir
        </button>
      </header>

      <div className="portal-body mt-page-in mt-scroll">
        <div className="portal-hero">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt-micro" style={{ color: 'var(--mt-muted)', marginBottom: 6 }}>{greeting}</div>
            <h1 className="portal-hero-title">
              {firstName ? `${firstName},` : 'Hola,'}
              <br />
              {heroLine}
            </h1>
            <div className="portal-hero-meta">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <CalendarDays size={13} />
                <span style={{ textTransform: 'capitalize' }}>{today}</span>
              </span>
              {nextDoseTime && (
                <>
                  <span className="portal-hero-meta-sep" />
                  <span>Próxima dosis a las <strong style={{ color: 'var(--mt-text)' }}>{nextDoseTime}</strong></span>
                </>
              )}
            </div>
          </div>
          <MoodAvatar score={dailyScore} />
        </div>

        <div className="portal-main-grid">
          {/* Columna izquierda — Dosis (1): acción principal del día */}
          <div className="portal-column">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -2 }}>
              <h2 className="portal-section-title" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.015em', margin: 0 }}>
                Dosis de hoy
              </h2>
              <span className="mt-small" style={{ textTransform: 'capitalize' }}>{today}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
              {doses.length === 0 ? (
                <div className="portal-card" style={{ padding: '28px 22px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--mt-success-subtle)', color: 'var(--mt-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <ShieldCheck size={24} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--mt-text)', margin: '0 0 4px' }}>Sin dosis programadas hoy</p>
                  <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Revisa tu plan completo si tienes dudas.</p>
                </div>
              ) : (
                doses.map(dose => <DoseCard key={dose.id} dose={dose} onConfirm={handleConfirm} />)
              )}
            </div>
          </div>

          {/* Columna derecha — Adherencia (2) → Próxima cita (3) → Check-in (4) → Labs (5) */}
          <div className="portal-column">
            <AdherenceCard
              confirmed={confirmedToday}
              total={totalToday}
              streakDays={engagement?.streak_days}
              customMessage={engagement?.headline ?? null}
              weekData={engagement?.week}
            />
            {portalAppointments?.upcoming.some(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.015em', margin: 0, color: 'var(--mt-text)' }}>
                    Próxima cita
                  </h2>
                  <a href="/portal/appointments" className="mt-small" style={{ color: 'var(--mt-primary)', textDecoration: 'none', fontWeight: 700 }}>
                    Ver todas →
                  </a>
                </div>
                <NextAppointmentCard appointments={portalAppointments} onConfirm={handleConfirmAttendance} />
              </div>
            )}
            <CheckInCard checkIn={checkIn} onSubmit={handleSubmitCheckIn} />
            <LabOrdersCard orders={labOrders} />
          </div>
        </div>

        <p style={{ marginTop: 22, textAlign: 'center', fontSize: 12.5, color: 'var(--mt-muted)', lineHeight: 1.5 }}>
          Si algo no coincide con las indicaciones que recibiste, consulta con tu equipo médico.
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
