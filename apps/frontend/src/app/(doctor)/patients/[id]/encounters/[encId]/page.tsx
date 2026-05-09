'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Pill, CheckCircle, XCircle, Loader2, Plus, Trash2,
  ClipboardList, Clock3, FileText, Save, Sparkles, Stethoscope, Wand2,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getEncounter, updateEncounter, closeEncounter, createTreatment, activateTreatment,
  listClinicalProtocols,
  runEncounterAiAssist,
  type AiAssistMode,
  type ClinicalProtocol,
  type Encounter,
  type TreatmentPlan,
} from '@/lib/doctor/api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalInsight,
  ClinicalPage,
  ClinicalPanel,
  LoadingState,
  StatusPill,
} from '@/components/doctor/clinical-ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const ENC_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta', FOLLOW_UP: 'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización', DISCHARGE: 'Alta',
  CHRONIC_CONTROL: 'Control crónico', EMERGENCY: 'Urgencia',
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Diario', EVERY_X_HOURS: 'Cada X horas', WEEKLY: 'Semanal', AS_NEEDED: 'Según necesidad',
}

const DOSE_UNITS = ['mg', 'ml', 'mcg', 'g', 'UI', 'tableta(s)', 'cápsula(s)', 'gota(s)', 'ampolla(s)', 'parche(s)']
const ROUTES = ['oral', 'sublingual', 'inhalatoria', 'tópica', 'inyectable IV', 'inyectable IM', 'subcutánea', 'rectal', 'vaginal', 'oftálmica', 'ótica']

const NOTE_TEMPLATES = [
  {
    label: 'SOAP',
    notes: 'Subjetivo:\n\nObjetivo:\n\nEvaluación:\n\nPlan:\n',
    summary: 'Plan:\n- \n\nSeguimiento:\n',
  },
  {
    label: 'Seguimiento',
    notes: 'Evolución desde última consulta:\n\nAdherencia referida:\n\nSíntomas o eventos relevantes:\n',
    summary: 'Continuar seguimiento.\nAjustes/indicaciones:\n',
  },
  {
    label: 'Alta/egreso',
    notes: 'Estado al egreso:\n\nIndicaciones entregadas:\n\nSignos de alarma revisados:\n',
    summary: 'Plan de egreso:\n- \n\nPróximo control:\n',
  },
]

const PLAN_PRESETS = [
  { label: 'Control 30 días', name: 'Plan de control 30 días', duration: '30', times: ['08:00'], count: '1' },
  { label: 'Corto 7 días', name: 'Tratamiento corto', duration: '7', times: ['08:00', '20:00'], count: '2' },
  { label: 'Post-alta', name: 'Plan post-alta', duration: '14', times: ['08:00', '14:00', '20:00'], count: '3' },
]

const FALLBACK_PROTOCOLS: ClinicalProtocol[] = PLAN_PRESETS.map((preset) => ({
  id: `fallback-${preset.label}`,
  source: 'SYSTEM',
  name: preset.label,
  category: 'GENERAL',
  description: null,
  encounter_type: null,
  note_template: null,
  summary_template: null,
  treatment_name: preset.name,
  treatment_instructions: null,
  medications: [{
    drug_name: '',
    dose_amount: 1,
    dose_unit: 'tableta(s)',
    route: 'oral',
    frequency_type: 'DAILY',
    times_per_day: preset.times,
    duration_days: Number(preset.duration),
    sort_order: 0,
  }],
  follow_up_days: Number(preset.duration),
  tags: [],
}))

const SCHEDULE_PRESETS = [
  { label: 'Mañana', frequency_type: 'DAILY', frequency_value: '8', times_per_day_count: '1', times_per_day: ['08:00'] },
  { label: 'Mañana/noche', frequency_type: 'DAILY', frequency_value: '12', times_per_day_count: '2', times_per_day: ['08:00', '20:00'] },
  { label: 'Tres veces', frequency_type: 'DAILY', frequency_value: '8', times_per_day_count: '3', times_per_day: ['08:00', '14:00', '20:00'] },
  { label: 'Cada 8h', frequency_type: 'EVERY_X_HOURS', frequency_value: '8', times_per_day_count: '3', times_per_day: ['08:00', '16:00', '00:00'] },
  { label: 'Según necesidad', frequency_type: 'AS_NEEDED', frequency_value: '8', times_per_day_count: '1', times_per_day: ['08:00'] },
]

// ─── Medication form ──────────────────────────────────────────────────────────

interface MedForm {
  drug_name: string
  presentation: string
  dose_amount: string
  dose_unit: string
  route: string
  frequency_type: string
  frequency_value: string     // for EVERY_X_HOURS
  times_per_day_count: string // for DAILY: number of times
  times_per_day: string[]     // HH:MM entries
  duration_days: string
  with_food: boolean
  special_instructions: string
}

function emptyMedForm(): MedForm {
  return {
    drug_name: '', presentation: '', dose_amount: '', dose_unit: 'mg',
    route: 'oral', frequency_type: 'DAILY', frequency_value: '8',
    times_per_day_count: '1', times_per_day: ['08:00'],
    duration_days: '30', with_food: false, special_instructions: '',
  }
}

// ─── Shared field styles ──────────────────────────────────────────────────────

const fldInput: React.CSSProperties = {
  height: 36, padding: '0 10px', borderRadius: 8, width: '100%',
  border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
  fontSize: 13, color: 'var(--mt-text)', fontFamily: 'var(--mt-font)',
  outline: 'none', boxSizing: 'border-box',
}
const fldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4,
}
function focusRing(e: React.FocusEvent) { (e.target as HTMLElement).style.boxShadow = 'var(--mt-shadow-focus)' }
function blurRing(e: React.FocusEvent)  { (e.target as HTMLElement).style.boxShadow = 'none' }

// ─── Medication form panel ────────────────────────────────────────────────────

function MedFormPanel({
  medForm,
  setMedForm,
  onAdd,
  onCancel,
  updateTimesCount,
  updateTime,
}: {
  medForm: MedForm
  setMedForm: React.Dispatch<React.SetStateAction<MedForm>>
  onAdd: () => void
  onCancel: () => void
  updateTimesCount: (v: string) => void
  updateTime: (i: number, v: string) => void
}) {
  const set = <K extends keyof MedForm>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setMedForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div style={{
      borderRadius: 12, border: '1px solid var(--mt-border)',
      background: 'var(--mt-surface)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--mt-border)',
        background: 'var(--mt-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <StepMarker number={2} title="Agregar medicamento" />
        {/* Schedule quick-select */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {SCHEDULE_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setMedForm(p => ({
                ...p,
                frequency_type: preset.frequency_type,
                frequency_value: preset.frequency_value,
                times_per_day_count: preset.times_per_day_count,
                times_per_day: preset.times_per_day,
              }))}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                color: 'var(--mt-text-2)', cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--mt-primary)'
                el.style.color = 'var(--mt-primary)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--mt-border)'
                el.style.color = 'var(--mt-text-2)'
              }}
            >
              <Clock3 size={10} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Drug name — full width */}
        <div>
          <label style={fldLabel}>Medicamento *</label>
          <input
            value={medForm.drug_name}
            onChange={set('drug_name')}
            onFocus={focusRing} onBlur={blurRing}
            placeholder="Ej: Enalapril"
            style={fldInput}
          />
        </div>

        {/* Dose row: amount + unit + route */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label style={fldLabel}>Dosis *</label>
            <input
              type="number"
              value={medForm.dose_amount}
              onChange={set('dose_amount')}
              onFocus={focusRing} onBlur={blurRing}
              placeholder="10"
              style={fldInput}
            />
          </div>
          <div>
            <label style={fldLabel}>Unidad</label>
            <select value={medForm.dose_unit} onChange={set('dose_unit')}
              onFocus={focusRing} onBlur={blurRing}
              style={fldInput}>
              {DOSE_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={fldLabel}>Vía</label>
            <select value={medForm.route} onChange={set('route')}
              onFocus={focusRing} onBlur={blurRing}
              style={fldInput}>
              {ROUTES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Frequency row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label style={fldLabel}>Frecuencia</label>
            <select value={medForm.frequency_type} onChange={set('frequency_type')}
              onFocus={focusRing} onBlur={blurRing}
              style={fldInput}>
              <option value="DAILY">Diario</option>
              <option value="EVERY_X_HOURS">Cada X horas</option>
              <option value="WEEKLY">Semanal</option>
              <option value="AS_NEEDED">Según necesidad</option>
            </select>
          </div>

          {medForm.frequency_type === 'EVERY_X_HOURS' && (
            <div>
              <label style={fldLabel}>Cada (horas)</label>
              <input type="number" min={1}
                value={medForm.frequency_value} onChange={set('frequency_value')}
                onFocus={focusRing} onBlur={blurRing}
                style={fldInput} />
            </div>
          )}

          {medForm.frequency_type === 'DAILY' && (
            <div>
              <label style={fldLabel}>Veces al día</label>
              <input type="number" min={1} max={6}
                value={medForm.times_per_day_count}
                onChange={e => updateTimesCount(e.target.value)}
                onFocus={focusRing} onBlur={blurRing}
                style={{ ...fldInput, width: 72 }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {medForm.times_per_day.map((t, i) => (
                  <input key={i} type="time" value={t}
                    onChange={e => updateTime(i, e.target.value)}
                    onFocus={focusRing} onBlur={blurRing}
                    style={{ ...fldInput, width: 'auto' }} />
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={fldLabel}>Duración (días)</label>
            <input type="number" min={1}
              value={medForm.duration_days} onChange={set('duration_days')}
              onFocus={focusRing} onBlur={blurRing}
              style={fldInput} />
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={medForm.with_food}
              onChange={e => setMedForm(p => ({ ...p, with_food: e.target.checked }))}
              style={{ width: 15, height: 15, accentColor: 'var(--mt-primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>Tomar con alimentos</span>
          </label>
          <div>
            <label style={fldLabel}>Instrucciones especiales</label>
            <input
              value={medForm.special_instructions}
              onChange={set('special_instructions')}
              onFocus={focusRing} onBlur={blurRing}
              placeholder="Ej: Evitar exposición al sol"
              style={fldInput}
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid var(--mt-border)',
        background: 'var(--mt-bg)', display: 'flex', justifyContent: 'flex-end', gap: 8,
      }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--mt-border)',
            background: 'var(--mt-surface)', fontSize: 13, color: 'var(--mt-text-2)',
            cursor: 'pointer', fontFamily: 'var(--mt-font)',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={!medForm.drug_name.trim() || !medForm.dose_amount}
          style={{
            height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
            background: 'var(--mt-primary)', color: '#fff', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--mt-font)',
            opacity: !medForm.drug_name.trim() || !medForm.dose_amount ? 0.5 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>
    </div>
  )
}

function MedicationCard({ med, onRemove }: { med: Partial<MedForm & { drug_name: string }>; onRemove: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderRadius: 10, border: '1px solid var(--mt-border)',
      background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-xs)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: 'var(--mt-primary-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Pill size={15} color="var(--mt-primary)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>
          {med.drug_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt-text-2)', marginTop: 2 }}>
          {med.dose_amount} {med.dose_unit}
          {' · '}{FREQ_LABELS[med.frequency_type ?? ''] ?? med.frequency_type}
          {med.frequency_type === 'EVERY_X_HOURS' && ` c/${med.frequency_value}h`}
          {med.frequency_type === 'DAILY' && med.times_per_day && ` (${med.times_per_day.join(', ')})`}
          {med.duration_days && ` · ${med.duration_days} días`}
        </div>
      </div>
      <button
        onClick={onRemove}
        style={{
          width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--mt-muted)', transition: 'color .2s', flexShrink: 0,
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--mt-danger)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--mt-muted)')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function StepMarker({ number, title }: { number: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: 'var(--mt-primary)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>{number}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>{title}</span>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EncounterPage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const patientId = params.id as string
  const encId = params.encId as string

  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [treatment, setTreatment] = useState<TreatmentPlan | null>(null)
  const [protocols, setProtocols] = useState<ClinicalProtocol[]>(FALLBACK_PROTOCOLS)
  const [loading, setLoading] = useState(true)

  // Notes editing
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [aiLoading, setAiLoading] = useState<AiAssistMode | null>(null)
  const [aiNotice, setAiNotice] = useState('')
  const [aiError, setAiError] = useState('')

  // Treatment builder
  const [treatmentName, setTreatmentName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [medications, setMedications] = useState<MedForm[]>([])
  const [showMedForm, setShowMedForm] = useState(false)
  const [medForm, setMedForm] = useState<MedForm>(emptyMedForm())
  const [savingTreatment, setSavingTreatment] = useState(false)
  const [treatmentError, setTreatmentError] = useState('')
  const [activating, setActivating] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showTools, setShowTools] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [enc, protocolList] = await Promise.all([
        getEncounter(token, encId),
        listClinicalProtocols(token).catch(() => FALLBACK_PROTOCOLS),
      ])
      setEncounter(enc)
      setNotes(enc.notes ?? '')
      setSummary(enc.summary ?? '')
      setProtocols(protocolList.length > 0 ? protocolList : FALLBACK_PROTOCOLS)
    } finally {
      setLoading(false)
    }
  }, [token, encId])

  useEffect(() => { load() }, [load])

  // Update times_per_day array when count changes
  function updateTimesCount(count: string) {
    const n = Math.max(1, Math.min(6, Number(count) || 1))
    const defaults = ['08:00', '14:00', '20:00', '02:00', '10:00', '16:00']
    const times = Array.from({ length: n }, (_, i) => medForm.times_per_day[i] ?? defaults[i])
    setMedForm(prev => ({ ...prev, times_per_day_count: String(n), times_per_day: times }))
  }

  function updateTime(index: number, value: string) {
    setMedForm(prev => {
      const times = [...prev.times_per_day]
      times[index] = value
      return { ...prev, times_per_day: times }
    })
  }

  function applyNoteTemplate(template: typeof NOTE_TEMPLATES[number]) {
    setNotes(prev => prev.trim() ? `${prev.trim()}\n\n${template.notes}` : template.notes)
    setSummary(prev => prev.trim() ? prev : template.summary)
  }

  function applyClinicalProtocol(protocol: ClinicalProtocol) {
    if (protocol.note_template) {
      setNotes(prev => prev.trim() ? `${prev.trim()}\n\n${protocol.note_template}` : protocol.note_template ?? '')
    }
    if (protocol.summary_template) {
      setSummary(prev => prev.trim() ? prev : protocol.summary_template ?? '')
    }
    if (protocol.treatment_name || protocol.name) {
      setTreatmentName(prev => prev || protocol.treatment_name || protocol.name)
    }

    const protocolMeds = protocol.medications.map((med) => ({
      drug_name: med.drug_name,
      presentation: med.presentation ?? '',
      dose_amount: String(med.dose_amount),
      dose_unit: med.dose_unit,
      route: med.route ?? 'oral',
      frequency_type: med.frequency_type,
      frequency_value: String(med.frequency_value ?? 8),
      times_per_day_count: String(med.times_per_day?.length ?? 1),
      times_per_day: med.times_per_day ?? ['08:00'],
      duration_days: String(med.duration_days ?? protocol.follow_up_days ?? 30),
      with_food: med.with_food ?? false,
      special_instructions: med.special_instructions ?? '',
    }))

    if (protocolMeds.length > 0) {
      const completeMeds = protocolMeds.filter(med => med.drug_name.trim())
      const incompleteMed = protocolMeds.find(med => !med.drug_name.trim())
      setMedications(completeMeds)
      setShowMedForm(Boolean(incompleteMed))
      setMedForm(incompleteMed ?? emptyMedForm())
    }
  }

  function applySchedulePreset(preset: typeof SCHEDULE_PRESETS[number]) {
    setMedForm(prev => ({
      ...prev,
      frequency_type: preset.frequency_type,
      frequency_value: preset.frequency_value,
      times_per_day_count: preset.times_per_day_count,
      times_per_day: preset.times_per_day,
    }))
  }

  function addMedication() {
    if (!medForm.drug_name.trim() || !medForm.dose_amount) return
    setMedications(prev => [...prev, { ...medForm }])
    setMedForm(emptyMedForm())
    setShowMedForm(false)
  }

  async function saveTreatment() {
    if (!token || medications.length === 0) return
    setSavingTreatment(true)
    setTreatmentError('')
    try {
      const plan = await createTreatment(token, encId, {
        name: treatmentName || `Tratamiento - ${new Date().toLocaleDateString('es')}`,
        start_date: startDate,
        medications: medications.map((m, i) => ({
          drug_name: m.drug_name,
          presentation: m.presentation || undefined,
          dose_amount: Number(m.dose_amount),
          dose_unit: m.dose_unit,
          route: m.route || undefined,
          frequency_type: m.frequency_type,
          frequency_value: m.frequency_type === 'EVERY_X_HOURS' ? Number(m.frequency_value) : undefined,
          times_per_day: m.frequency_type === 'DAILY' ? m.times_per_day : undefined,
          duration_days: m.duration_days ? Number(m.duration_days) : undefined,
          with_food: m.with_food,
          special_instructions: m.special_instructions || undefined,
          sort_order: i,
        })),
      })
      setTreatment(plan)
      setMedications([])
    } catch (err) {
      setTreatmentError(err instanceof Error ? err.message : 'Error al guardar el tratamiento')
    } finally {
      setSavingTreatment(false)
    }
  }

  async function handleActivate() {
    if (!token || !treatment) return
    setActivating(true)
    try {
      const updated = await activateTreatment(token, treatment.id)
      setTreatment(updated)
    } finally {
      setActivating(false)
    }
  }

  async function handleSaveNotes() {
    if (!token) return
    setSavingNotes(true)
    try {
      const updated = await updateEncounter(token, encId, {
        notes: notes || undefined,
        summary: summary || undefined,
      })
      setEncounter(updated)
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleAiAssist(mode: AiAssistMode) {
    if (!token) return
    setAiLoading(mode)
    setAiNotice('')
    setAiError('')
    try {
      const sourceText = [
        encounter?.chief_complaint ? `Motivo: ${encounter.chief_complaint}` : '',
        notes,
        summary,
      ].filter(Boolean).join('\n')

      const draft = await runEncounterAiAssist(token, encId, mode, sourceText)
      if (mode === 'SUMMARIZE_ENCOUNTER') {
        setSummary(draft.text)
      } else {
        setSummary(prev => prev.trim() ? `${prev.trim()}\n\n${draft.text}` : draft.text)
      }
      setAiNotice(draft.safety_notice)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo generar el borrador asistido')
    } finally {
      setAiLoading(null)
    }
  }

  async function handleClose() {
    if (!token || !confirm('¿Cerrar esta consulta?')) return
    setClosing(true)
    try {
      await closeEncounter(token, encId, { summary: summary || undefined })
      router.push(`/patients/${patientId}`)
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <ClinicalPage size="compact">
        <LoadingState label="Cargando consulta..." />
      </ClinicalPage>
    )
  }

  if (!encounter) return null

  const isClosed = encounter.status === 'CLOSED' || encounter.status === 'ARCHIVED'
  const hasUnsavedNotes = notes !== (encounter.notes ?? '') || summary !== (encounter.summary ?? '')

  return (
    <ClinicalPage size="compact">
      <ClinicalHeader
        eyebrow="Consulta clínica"
        title={ENC_LABELS[encounter.encounter_type] ?? encounter.encounter_type}
        subtitle={new Date(encounter.opened_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        icon={Stethoscope}
        meta={
          <StatusPill tone={encounter.status === 'OPEN' ? 'green' : 'slate'}>
            {encounter.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
          </StatusPill>
        }
        actions={
          <>
            <ClinicalButton href={`/patients/${patientId}`} icon={ArrowLeft} variant="outline" tone="slate">
              Paciente
            </ClinicalButton>
            {!isClosed && (
              <ClinicalButton
                icon={closing ? Loader2 : XCircle}
                onClick={handleClose}
                disabled={closing}
                variant="outline"
                tone="red"
              >
                Cerrar
              </ClinicalButton>
            )}
          </>
        }
      />

      {!isClosed && hasUnsavedNotes && (
        <ClinicalInsight tone="amber" title="Cambios sin guardar">
          Hay cambios en las notas de esta consulta. Guarda antes de cerrar o salir del flujo.
        </ClinicalInsight>
      )}

      <ClinicalPanel
        title="Notas clínicas"
        icon={FileText}
        actions={!isClosed ? (
          <button
            type="button"
            onClick={() => setShowTools(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--mt-border)',
              background: showTools ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
              color: showTools ? 'var(--mt-primary)' : 'var(--mt-muted)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
              fontFamily: 'var(--mt-font)',
            }}
          >
            <Wand2 size={13} />
            Herramientas
          </button>
        ) : undefined}
      >
        <div className="flex flex-col gap-4 p-5">
          {!isClosed && showTools && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--mt-bg)', border: '1px solid var(--mt-border)',
            }}>
              <span style={{ width: '100%', fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                Plantillas de notas
              </span>
              {NOTE_TEMPLATES.map(template => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => applyNoteTemplate(template)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700"
                >
                  <Sparkles size={12} />
                  {template.label}
                </button>
              ))}
              <div style={{ width: '100%', height: 1, background: 'var(--mt-border)', margin: '4px 0' }} />
              <span style={{ width: '100%', fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                Asistencia IA
              </span>
              <button
                type="button"
                onClick={() => handleAiAssist('SUMMARIZE_ENCOUNTER')}
                disabled={Boolean(aiLoading)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-60"
              >
                {aiLoading === 'SUMMARIZE_ENCOUNTER' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Sugerir resumen
              </button>
              <button
                type="button"
                onClick={() => handleAiAssist('SIMPLIFY_FOR_PATIENT')}
                disabled={Boolean(aiLoading)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
              >
                {aiLoading === 'SIMPLIFY_FOR_PATIENT' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Lenguaje paciente
              </button>
            </div>
          )}

          {aiNotice && (
            <ClinicalInsight tone="blue" title="Asistencia IA">
              {aiNotice}
            </ClinicalInsight>
          )}

          {aiError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{aiError}</p>
          )}

        {encounter.chief_complaint && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">Motivo de consulta</p>
            <p className="text-sm text-slate-700">{encounter.chief_complaint}</p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Evolución / Notas</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isClosed}
            rows={4}
            placeholder="Anamnesis, exploración física, diagnóstico..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Resumen / Plan</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            disabled={isClosed}
            rows={3}
            placeholder="Diagnóstico final, plan de acción..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {!isClosed && (
          <div className="flex justify-end">
            <ClinicalButton
              icon={savingNotes ? Loader2 : Save}
              onClick={handleSaveNotes}
              disabled={savingNotes}
              variant="outline"
              tone={hasUnsavedNotes ? 'blue' : 'slate'}
            >
              Guardar notas
            </ClinicalButton>
          </div>
        )}
        </div>
      </ClinicalPanel>

      {/* Treatment builder */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Pill size={16} className="text-slate-500" />
            Plan de tratamiento
          </h2>
          {treatment && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              treatment.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
              treatment.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {treatment.status === 'ACTIVE' ? 'Activo' :
               treatment.status === 'DRAFT' ? 'Borrador' : treatment.status}
            </span>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Existing treatment */}
          {treatment ? (
            <>
              <div>
                <p className="text-sm font-medium text-slate-700">{treatment.name}</p>
                <p className="text-xs text-slate-400">Desde {new Date(treatment.start_date).toLocaleDateString('es')}</p>
              </div>
              <div className="flex flex-col gap-2">
                {treatment.medications.map(med => (
                  <div key={med.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <Pill size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{med.drug_name}</p>
                      <p className="text-xs text-slate-500">
                        {med.dose_amount} {med.dose_unit}
                        {' · '}{FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                        {med.frequency_type === 'EVERY_X_HOURS' && med.frequency_value && ` c/${med.frequency_value}h`}
                        {med.frequency_type === 'DAILY' && med.times_per_day && ` (${med.times_per_day.join(', ')})`}
                        {med.duration_days && ` · ${med.duration_days} días`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {treatment.status === 'DRAFT' && !isClosed && (
                <button
                  onClick={handleActivate}
                  disabled={activating}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-green-600 transition-colors"
                >
                  {activating
                    ? <><Loader2 size={16} className="animate-spin" /> Activando...</>
                    : <><CheckCircle size={16} /> Activar tratamiento</>
                  }
                </button>
              )}
              {treatment.status === 'ACTIVE' && (
                <p className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle size={16} />
                  Tratamiento activo — generando recordatorios de dosis
                </p>
              )}
            </>
          ) : isClosed ? (
            <p className="text-sm text-slate-400 text-center py-4">Esta consulta no tiene plan de tratamiento.</p>
          ) : (
            <>
              <div style={{
                borderRadius: 12, border: '1px solid var(--mt-border)',
                background: 'var(--mt-surface)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--mt-border)',
                  background: 'var(--mt-bg)',
                }}>
                  <StepMarker number={1} title="Elegir protocolo" />
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="grid gap-2 md:grid-cols-3">
                    {protocols.slice(0, 6).map(protocol => (
                      <button
                        key={protocol.id}
                        type="button"
                        onClick={() => applyClinicalProtocol(protocol)}
                        title={protocol.description ?? ''}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 4,
                          padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                          border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                          cursor: 'pointer', transition: 'border-color .2s, background .2s',
                          boxShadow: 'var(--mt-shadow-xs)',
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLElement
                          el.style.borderColor = 'var(--mt-primary)'
                          el.style.background = 'var(--mt-primary-subtle)'
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLElement
                          el.style.borderColor = 'var(--mt-border)'
                          el.style.background = 'var(--mt-surface)'
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 600, color: 'var(--mt-primary)',
                        }}>
                          <ClipboardList size={12} />
                          {protocol.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                          {protocol.medications.length === 0
                            ? 'Sin medicamentos'
                            : `${protocol.medications.length} medicamento${protocol.medications.length > 1 ? 's' : ''}`}
                          {protocol.follow_up_days ? ` · control ${protocol.follow_up_days}d` : ''}
                        </span>
                      </button>
                    ))}
                  </div>

                </div>
              </div>

              {/* Treatment meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Nombre del plan
                  </label>
                  <input
                    list="plan-names-list"
                    value={treatmentName}
                    onChange={e => setTreatmentName(e.target.value)}
                    placeholder="Seleccionar o escribir nombre…"
                    style={{
                      height: 36, padding: '0 10px', borderRadius: 8, width: '100%',
                      border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                      fontSize: 13, color: 'var(--mt-text)', fontFamily: 'var(--mt-font)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => ((e.target as HTMLElement).style.boxShadow = 'var(--mt-shadow-focus)')}
                    onBlur={e => ((e.target as HTMLElement).style.boxShadow = 'none')}
                  />
                  <datalist id="plan-names-list">
                    {protocols.map(p => (
                      <option key={p.id} value={p.treatment_name || p.name} />
                    ))}
                  </datalist>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{
                      height: 36, padding: '0 10px', borderRadius: 8, width: '100%',
                      border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                      fontSize: 13, color: 'var(--mt-text)', fontFamily: 'var(--mt-font)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => ((e.target as HTMLElement).style.boxShadow = 'var(--mt-shadow-focus)')}
                    onBlur={e => ((e.target as HTMLElement).style.boxShadow = 'none')}
                  />
                </div>
              </div>

              {/* Medication list */}
              {medications.length > 0 && (
                <div className="flex flex-col gap-2">
                  {medications.map((m, i) => (
                    <MedicationCard
                      key={i}
                      med={m}
                      onRemove={() => setMedications(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}

              {/* Add medication form */}
              {showMedForm ? (
                <MedFormPanel
                  medForm={medForm}
                  setMedForm={setMedForm}
                  onAdd={addMedication}
                  onCancel={() => { setShowMedForm(false); setMedForm(emptyMedForm()) }}
                  updateTimesCount={updateTimesCount}
                  updateTime={updateTime}
                />
              ) : (
                <button
                  onClick={() => setShowMedForm(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 500, color: 'var(--mt-primary)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                  }}
                >
                  <Plus size={15} />
                  Agregar medicamento
                </button>
              )}

              {treatmentError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{treatmentError}</p>
              )}

              {medications.length > 0 && (
                <button
                  onClick={saveTreatment}
                  disabled={savingTreatment}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors"
                >
                  {savingTreatment
                    ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                    : 'Guardar plan de tratamiento'
                  }
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </ClinicalPage>
  )
}
