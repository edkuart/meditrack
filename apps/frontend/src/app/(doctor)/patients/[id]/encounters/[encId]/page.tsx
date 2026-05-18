'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Activity, AlertTriangle, ArrowLeft, Pill, CheckCircle, XCircle, Loader2, Plus, Trash2,
  ChevronDown, ChevronUp, ClipboardList, Copy, ExternalLink, FileText, Link2,
  MessageCircle, Save, Sparkles, Stethoscope, Wand2,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getEncounter, updateEncounter, closeEncounter, createTreatment, activateTreatment,
  generatePortalAccess, listClinicalProtocols,
  runEncounterAiAssist,
  type AccessResult,
  type AiAssistMode,
  type ClinicalProtocol,
  type Encounter,
  type EncounterWorkflowStage,
  type TreatmentPlan,
} from '@/lib/doctor/api'
import {
  runPatientClinicalCopilot,
  type ClinicalCopilotMode,
  type ClinicalCopilotResponse,
} from '@/lib/doctor/clinical-intelligence-api'
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

const INTERV_TYPE_LABELS: Record<string, string> = {
  EXERCISE: 'Ejercicio', DIET: 'Dieta', THERAPY: 'Terapia', MONITORING: 'Monitoreo', OTHER: 'Otro',
}

const DOSE_UNITS = ['mg', 'ml', 'mcg', 'g', 'UI', 'tableta(s)', 'cápsula(s)', 'gota(s)', 'ampolla(s)', 'parche(s)']
const ROUTES = ['oral', 'sublingual', 'inhalatoria', 'tópica', 'inyectable IV', 'inyectable IM', 'subcutánea', 'rectal', 'vaginal', 'oftálmica', 'ótica']
const portalAccessStorageKey = (patientId: string) => `meditrack.portalAccess.${patientId}`

function withFreshPortalSession(url: string) {
  const next = new URL(url)
  next.searchParams.set('fresh', '1')
  return next.toString()
}

function getWorkflowStage(metadata?: Record<string, unknown> | null): EncounterWorkflowStage {
  const value = metadata?.workflow_stage
  return typeof value === 'string' && WORKFLOW_STAGES.includes(value as EncounterWorkflowStage)
    ? value as EncounterWorkflowStage
    : 'SUBJECTIVE'
}

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

const WORKFLOW_STAGE_LABELS: Record<EncounterWorkflowStage, string> = {
  INTAKE: 'Entrada',
  ROOMING: 'Triage',
  SUBJECTIVE: 'Subjetivo',
  OBJECTIVE: 'Objetivo',
  ASSESSMENT: 'Evaluación',
  PLAN: 'Plan',
  ORDERS: 'Órdenes',
  READY_TO_CLOSE: 'Listo para cierre',
}

const WORKFLOW_STAGES: EncounterWorkflowStage[] = [
  'INTAKE',
  'ROOMING',
  'SUBJECTIVE',
  'OBJECTIVE',
  'ASSESSMENT',
  'PLAN',
  'ORDERS',
  'READY_TO_CLOSE',
]

const COPILOT_MODES: Array<{
  mode: Exclude<ClinicalCopilotMode, 'ASK_CLINICAL_QUESTION'>
  label: string
  tone: 'blue' | 'amber' | 'green'
}> = [
  { mode: 'PREPARE_CONSULTATION', label: 'Preparar', tone: 'blue' },
  { mode: 'SUGGEST_PATIENT_QUESTIONS', label: 'Preguntas', tone: 'amber' },
  { mode: 'REVIEW_CLINICAL_GAPS', label: 'Brechas', tone: 'amber' },
  { mode: 'DRAFT_SOAP', label: 'Borrador SOAP', tone: 'green' },
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

// ─── Intervention form ────────────────────────────────────────────────────────

interface IntervForm {
  type: string
  title: string
  description: string
  frequency: string
  duration: string
  instructions: string
}

function emptyIntervForm(): IntervForm {
  return { type: 'OTHER', title: '', description: '', frequency: '', duration: '', instructions: '' }
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
        background: 'var(--mt-bg)',
      }}>
        <StepMarker number={2} title="Agregar medicamento" />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          <div className="col-span-2 sm:col-span-1">
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
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-3.5 py-2.5 border-t" style={{ background: 'var(--mt-bg)', borderColor: 'var(--mt-border)' }}>
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto"
          style={{
            height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--mt-border)',
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
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
          style={{
            height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
            background: 'var(--mt-primary)', color: '#fff', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--mt-font)',
            opacity: !medForm.drug_name.trim() || !medForm.dose_amount ? 0.5 : 1,
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

// ─── Intervention form panel ──────────────────────────────────────────────────

function IntervFormPanel({
  intervForm,
  setIntervForm,
  onAdd,
  onCancel,
}: {
  intervForm: IntervForm
  setIntervForm: React.Dispatch<React.SetStateAction<IntervForm>>
  onAdd: () => void
  onCancel: () => void
}) {
  const set = <K extends keyof IntervForm>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setIntervForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div style={{
      borderRadius: 12, border: '1px solid var(--mt-border)',
      background: 'var(--mt-surface)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--mt-border)', background: 'var(--mt-bg)' }}>
        <StepMarker number={3} title="Indicaciones no farmacológicas" />
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label style={fldLabel}>Tipo</label>
            <select value={intervForm.type} onChange={set('type')} onFocus={focusRing} onBlur={blurRing} style={fldInput}>
              <option value="EXERCISE">Ejercicio</option>
              <option value="DIET">Dieta</option>
              <option value="THERAPY">Terapia</option>
              <option value="MONITORING">Monitoreo</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>
          <div>
            <label style={fldLabel}>Título *</label>
            <input value={intervForm.title} onChange={set('title')} onFocus={focusRing} onBlur={blurRing}
              placeholder="Ej: Caminata 30 min" style={fldInput} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label style={fldLabel}>Frecuencia</label>
            <input value={intervForm.frequency} onChange={set('frequency')} onFocus={focusRing} onBlur={blurRing}
              placeholder="Ej: 3 veces por semana" style={fldInput} />
          </div>
          <div>
            <label style={fldLabel}>Duración</label>
            <input value={intervForm.duration} onChange={set('duration')} onFocus={focusRing} onBlur={blurRing}
              placeholder="Ej: 4 semanas" style={fldInput} />
          </div>
        </div>
        <div>
          <label style={fldLabel}>Instrucciones</label>
          <input value={intervForm.instructions} onChange={set('instructions')} onFocus={focusRing} onBlur={blurRing}
            placeholder="Indicaciones adicionales" style={fldInput} />
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-3.5 py-2.5 border-t" style={{ background: 'var(--mt-bg)', borderColor: 'var(--mt-border)' }}>
        <button type="button" onClick={onCancel} className="w-full sm:w-auto" style={{
          height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--mt-border)',
          background: 'var(--mt-surface)', fontSize: 13, color: 'var(--mt-text-2)',
          cursor: 'pointer', fontFamily: 'var(--mt-font)',
        }}>Cancelar</button>
        <button type="button" onClick={onAdd} disabled={!intervForm.title.trim()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
          style={{
            height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
            background: 'var(--mt-primary)', color: '#fff', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--mt-font)',
            opacity: !intervForm.title.trim() ? 0.5 : 1,
          }}>
          <Plus size={14} />
          Agregar
        </button>
      </div>
    </div>
  )
}

function InterventionCard({ interv, onRemove }: { interv: IntervForm; onRemove: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderRadius: 10, border: '1px solid var(--mt-border)',
      background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-xs)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: 'oklch(97% 0.02 160)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Activity size={15} color="#059669" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>{interv.title}</div>
        <div style={{ fontSize: 12, color: 'var(--mt-text-2)', marginTop: 2 }}>
          {INTERV_TYPE_LABELS[interv.type] ?? interv.type}
          {interv.frequency && ` · ${interv.frequency}`}
          {interv.duration && ` · ${interv.duration}`}
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
  const [subjective, setSubjective] = useState('')
  const [objective, setObjective] = useState('')
  const [assessment, setAssessment] = useState('')
  const [plan, setPlan] = useState('')
  const [workflowStage, setWorkflowStage] = useState<EncounterWorkflowStage>('SUBJECTIVE')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [aiLoading, setAiLoading] = useState<AiAssistMode | null>(null)
  const [aiNotice, setAiNotice] = useState('')
  const [aiError, setAiError] = useState('')
  const [copilotLoading, setCopilotLoading] = useState<ClinicalCopilotMode | null>(null)
  const [copilotQuestion, setCopilotQuestion] = useState('')
  const [copilotResult, setCopilotResult] = useState<ClinicalCopilotResponse | null>(null)

  // Treatment builder
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null)
  const [treatmentName, setTreatmentName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [medications, setMedications] = useState<MedForm[]>([])
  const [showMedForm, setShowMedForm] = useState(false)
  const [medForm, setMedForm] = useState<MedForm>(emptyMedForm())
  const [savingTreatment, setSavingTreatment] = useState(false)
  const [treatmentError, setTreatmentError] = useState('')
  const [interventions, setInterventions] = useState<IntervForm[]>([])
  const [showIntervForm, setShowIntervForm] = useState(false)
  const [intervForm, setIntervForm] = useState<IntervForm>(emptyIntervForm())
  const [activating, setActivating] = useState(false)
  const [closing, setClosing] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [showTreatmentDetails, setShowTreatmentDetails] = useState(false)
  const [portalAccess, setPortalAccess] = useState<AccessResult | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalCopied, setPortalCopied] = useState(false)
  const [portalError, setPortalError] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [enc, protocolList] = await Promise.all([
        getEncounter(token, encId),
        listClinicalProtocols(token).catch(() => FALLBACK_PROTOCOLS),
      ])
      setEncounter(enc)
      setTreatment(enc.treatment_plan ?? null)
      setNotes(enc.notes ?? '')
      setSummary(enc.summary ?? '')
      setSubjective(enc.subjective ?? '')
      setObjective(enc.objective ?? '')
      setAssessment(enc.assessment ?? '')
      setPlan(enc.plan ?? '')
      setWorkflowStage(getWorkflowStage(enc.metadata))
      setProtocols(protocolList.length > 0 ? protocolList : FALLBACK_PROTOCOLS)
    } finally {
      setLoading(false)
    }
  }, [token, encId])

  useEffect(() => {
    const id = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(portalAccessStorageKey(patientId))
      if (!raw) return

      const saved = JSON.parse(raw) as AccessResult
      if (new Date(saved.expires_at) <= new Date()) {
        window.localStorage.removeItem(portalAccessStorageKey(patientId))
        return
      }
      if (saved.channel === 'pin') {
        window.localStorage.removeItem(portalAccessStorageKey(patientId))
        return
      }

      setPortalAccess(saved)
    } catch {
      window.localStorage.removeItem(portalAccessStorageKey(patientId))
    }
  }, [patientId])

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
    setSelectedProtocolId(protocol.id)

    // Protocol selection defines follow-up cadence and optional defaults; the
    // plan name remains a clinician-authored field.
    setMedications([])
    setShowMedForm(false)
    setMedForm(emptyMedForm())

    if (protocol.note_template) {
      setNotes(prev => prev.trim() ? `${prev.trim()}\n\n${protocol.note_template}` : protocol.note_template ?? '')
    }
    if (protocol.summary_template) {
      setSummary(prev => prev.trim() ? prev : protocol.summary_template ?? '')
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

  function addMedication() {
    if (!medForm.drug_name.trim() || !medForm.dose_amount) return
    setMedications(prev => [...prev, { ...medForm }])
    setMedForm(emptyMedForm())
    setShowMedForm(false)
  }

  function addInterventionItem() {
    if (!intervForm.title.trim()) return
    setInterventions(prev => [...prev, { ...intervForm }])
    setIntervForm(emptyIntervForm())
    setShowIntervForm(false)
  }

  function inferWorkflowStage(next = {
    subjective,
    objective,
    assessment,
    plan,
    summary,
  }): EncounterWorkflowStage {
    if (next.plan.trim() || next.summary.trim() || treatment || medications.length > 0 || interventions.length > 0) return 'PLAN'
    if (next.assessment.trim()) return 'ASSESSMENT'
    if (next.objective.trim()) return 'OBJECTIVE'
    if (next.subjective.trim() || encounter?.chief_complaint?.trim()) return 'SUBJECTIVE'
    return 'INTAKE'
  }

  async function saveTreatment() {
    if (!token || (medications.length === 0 && interventions.length === 0)) return
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
        interventions: interventions.map((iv, i) => ({
          type: iv.type as 'EXERCISE' | 'DIET' | 'THERAPY' | 'MONITORING' | 'OTHER',
          title: iv.title,
          description: iv.description || undefined,
          frequency: iv.frequency || undefined,
          duration: iv.duration || undefined,
          instructions: iv.instructions || undefined,
          sort_order: i,
        })),
      })
      setTreatment(plan)
      setWorkflowStage('ORDERS')
      setMedications([])
      setInterventions([])
      setSelectedProtocolId(null)
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
      // Backend activate response omits medications — preserve from current state
      setTreatment(prev => prev ? { ...prev, ...updated, medications: prev.medications } : prev)
    } finally {
      setActivating(false)
    }
  }

  async function handleSaveNotes() {
    if (!token) return
    setSavingNotes(true)
    setNotesError('')
    setNotesSaved(false)
    try {
      const updated = await updateEncounter(token, encId, {
        notes,
        summary,
        subjective,
        objective,
        assessment,
        plan,
        workflow_stage: inferWorkflowStage(),
      })
      setEncounter(updated)
      setWorkflowStage(getWorkflowStage(updated.metadata))
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 3000)
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Error al guardar las notas')
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

  async function handleClinicalCopilot(mode: ClinicalCopilotMode, question?: string) {
    if (!token) return
    setCopilotLoading(mode)
    setAiError('')
    setAiNotice('')
    try {
      const sourceText = [
        encounter?.chief_complaint ? `Motivo: ${encounter.chief_complaint}` : '',
        subjective ? `Subjetivo:\n${subjective}` : '',
        objective ? `Objetivo:\n${objective}` : '',
        assessment ? `Evaluación:\n${assessment}` : '',
        plan ? `Plan:\n${plan}` : '',
        notes ? `Notas libres:\n${notes}` : '',
        summary ? `Resumen:\n${summary}` : '',
      ].filter(Boolean).join('\n\n')

      const result = await runPatientClinicalCopilot(token, patientId, {
        mode,
        encounter_id: encId,
        question,
        source_text: sourceText || undefined,
        save_to_review_queue: mode === 'DRAFT_SOAP',
      })
      setCopilotResult(result)
      setAiNotice(result.safety_notice)

      if (result.soap_draft && mode === 'DRAFT_SOAP') {
        setSubjective(prev => prev.trim() ? prev : result.soap_draft?.subjective ?? '')
        setObjective(prev => prev.trim() ? prev : result.soap_draft?.objective ?? '')
        setAssessment(prev => prev.trim() ? prev : result.soap_draft?.assessment ?? '')
        setPlan(prev => prev.trim() ? prev : result.soap_draft?.plan ?? '')
        setWorkflowStage('ASSESSMENT')
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo consultar el copiloto clínico')
    } finally {
      setCopilotLoading(null)
    }
  }

  function handleAskCopilot() {
    const question = copilotQuestion.trim()
    if (question.length < 3) return
    void handleClinicalCopilot('ASK_CLINICAL_QUESTION', question)
  }

  async function handleClose() {
    if (!token) return
    const missing = [
      !subjective.trim() && !encounter?.chief_complaint?.trim() ? 'subjetivo' : '',
      !objective.trim() ? 'objetivo' : '',
      !assessment.trim() ? 'evaluación' : '',
      !plan.trim() && !summary.trim() && !treatment ? 'plan' : '',
    ].filter(Boolean)
    const message = missing.length > 0
      ? `Aún faltan: ${missing.join(', ')}. ¿Cerrar esta consulta de todos modos?`
      : '¿Cerrar esta consulta?'
    if (!confirm(message)) return
    setClosing(true)
    try {
      await closeEncounter(token, encId, {
        notes,
        summary,
        subjective,
        objective,
        assessment,
        plan,
      })
      router.push(`/patients/${patientId}`)
    } finally {
      setClosing(false)
    }
  }

  async function handleGeneratePortalAccess(channel: 'magic_link' | 'whatsapp' = 'magic_link') {
    if (!token) return
    setPortalLoading(true)
    setPortalError('')
    setPortalCopied(false)
    try {
      const access = await generatePortalAccess(token, patientId, channel)
      setPortalAccess(access)
      window.localStorage.setItem(portalAccessStorageKey(patientId), JSON.stringify(access))
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'No se pudo generar o enviar el acceso del paciente')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleCopyPortalLink() {
    if (!portalAccess?.access_url) return
    try {
      await navigator.clipboard.writeText(withFreshPortalSession(portalAccess.access_url))
      setPortalCopied(true)
      window.setTimeout(() => setPortalCopied(false), 2000)
    } catch {
      setPortalError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.')
    }
  }

  function handleOpenPortalAccess() {
    if (!portalAccess?.access_url) return
    try {
      window.sessionStorage.removeItem('meditrack_patient_session')
    } catch {}
    window.open(withFreshPortalSession(portalAccess.access_url), '_blank', 'noopener,noreferrer')
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
  const soapChecks = [
    { key: 'subjective', label: 'Subjetivo', done: Boolean(subjective.trim() || encounter.chief_complaint?.trim()) },
    { key: 'objective', label: 'Objetivo', done: Boolean(objective.trim()) },
    { key: 'assessment', label: 'Evaluación', done: Boolean(assessment.trim()) },
    { key: 'plan', label: 'Plan', done: Boolean(plan.trim() || summary.trim() || treatment) },
  ]
  const missingCloseItems = soapChecks.filter(item => !item.done)
  const readyToClose = missingCloseItems.length === 0
  const hasUnsavedNotes =
    notes !== (encounter.notes ?? '') ||
    summary !== (encounter.summary ?? '') ||
    subjective !== (encounter.subjective ?? '') ||
    objective !== (encounter.objective ?? '') ||
    assessment !== (encounter.assessment ?? '') ||
    plan !== (encounter.plan ?? '') ||
    workflowStage !== getWorkflowStage(encounter.metadata)

  return (
    <ClinicalPage size="compact">
      <ClinicalHeader
        eyebrow="Consulta clínica"
        title={ENC_LABELS[encounter.encounter_type] ?? encounter.encounter_type}
        subtitle={new Date(encounter.opened_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        icon={Stethoscope}
        meta={
          <>
            <StatusPill tone={encounter.status === 'OPEN' ? 'green' : 'slate'}>
              {encounter.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
            </StatusPill>
            <StatusPill tone={readyToClose ? 'green' : 'amber'}>
              {readyToClose ? 'Lista para cierre' : WORKFLOW_STAGE_LABELS[workflowStage]}
            </StatusPill>
          </>
        }
        actions={
          <>
            <ClinicalButton href={`/patients/${patientId}`} icon={ArrowLeft} variant="outline" tone="slate">
              Paciente
            </ClinicalButton>
            {!isClosed && (
              <ClinicalButton
                icon={portalLoading ? Loader2 : MessageCircle}
                onClick={() => handleGeneratePortalAccess('whatsapp')}
                disabled={portalLoading}
                variant="outline"
                tone="green"
              >
                Enviar WhatsApp
              </ClinicalButton>
            )}
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
          Hay cambios en esta consulta. Guarda antes de cerrar o salir del flujo.
        </ClinicalInsight>
      )}

      {!isClosed && !readyToClose && (
        <ClinicalInsight tone="blue" title="Consulta en progreso">
          Faltan: {missingCloseItems.map(item => item.label).join(', ')}. Puedes guardar el avance y continuar después.
        </ClinicalInsight>
      )}

      <ClinicalPanel
        title="Flujo clínico de consulta"
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

        {isClosed ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['Subjetivo', subjective || encounter.chief_complaint],
              ['Objetivo', objective],
              ['Evaluación', assessment],
              ['Plan', plan || summary],
            ].map(([label, value]) => (
              <div key={label} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </div>
                <div className="min-h-24 whitespace-pre-wrap px-3 py-3 text-sm leading-6 text-slate-700">
                  {value || <span className="italic text-slate-400">Sin registro</span>}
                </div>
              </div>
            ))}
            {(notes || summary) && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas adicionales</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{[notes, summary].filter(Boolean).join('\n\n')}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {WORKFLOW_STAGES.map(stage => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setWorkflowStage(stage)}
                    className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                      workflowStage === stage
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {WORKFLOW_STAGE_LABELS[stage]}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {soapChecks.map(item => (
                  <span
                    key={item.key}
                    className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium ${
                      item.done
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Subjetivo</label>
                <textarea
                  value={subjective}
                  onChange={e => { setSubjective(e.target.value); setWorkflowStage('SUBJECTIVE') }}
                  rows={5}
                  placeholder="Historia del padecimiento actual, síntomas, revisión por sistemas..."
                  className="min-h-32 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Objetivo</label>
                <textarea
                  value={objective}
                  onChange={e => { setObjective(e.target.value); setWorkflowStage('OBJECTIVE') }}
                  rows={5}
                  placeholder="Signos vitales, examen físico, hallazgos, laboratorios relevantes..."
                  className="min-h-32 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Evaluación</label>
                <textarea
                  value={assessment}
                  onChange={e => { setAssessment(e.target.value); setWorkflowStage('ASSESSMENT') }}
                  rows={5}
                  placeholder="Impresión diagnóstica, CIE-10, diferenciales, riesgos..."
                  className="min-h-32 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Plan</label>
                <textarea
                  value={plan}
                  onChange={e => { setPlan(e.target.value); setWorkflowStage('PLAN') }}
                  rows={5}
                  placeholder="Plan diagnóstico, tratamiento, educación, seguimiento..."
                  className="min-h-32 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>

            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600">Notas adicionales y resumen para portal</summary>
              <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Notas libres internas..."
                  className="resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={4}
                  placeholder="Resumen corto, seguimiento o instrucciones para paciente..."
                  className="resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </details>

            {notesError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{notesError}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              {notesSaved && (
                <span style={{ fontSize: 12, color: 'var(--mt-success, #047857)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={13} />
                  Guardado
                </span>
              )}
              <ClinicalButton
                icon={savingNotes ? Loader2 : Save}
                onClick={handleSaveNotes}
                disabled={savingNotes}
                variant="outline"
                tone={hasUnsavedNotes ? 'blue' : 'slate'}
              >
                Guardar avance
              </ClinicalButton>
            </div>
          </>
        )}
        </div>
      </ClinicalPanel>

      {!isClosed && (
        <ClinicalPanel title="Copiloto clínico" icon={Sparkles} collapsible defaultOpen={false}>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap gap-2">
              {COPILOT_MODES.map(item => (
                <ClinicalButton
                  key={item.mode}
                  icon={copilotLoading === item.mode ? Loader2 : Sparkles}
                  onClick={() => handleClinicalCopilot(item.mode)}
                  disabled={Boolean(copilotLoading)}
                  variant="outline"
                  tone={item.tone}
                >
                  {item.label}
                </ClinicalButton>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={copilotQuestion}
                onChange={e => setCopilotQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAskCopilot()
                  }
                }}
                placeholder="Preguntar al historial del paciente..."
                className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <ClinicalButton
                icon={copilotLoading === 'ASK_CLINICAL_QUESTION' ? Loader2 : Sparkles}
                onClick={handleAskCopilot}
                disabled={Boolean(copilotLoading) || copilotQuestion.trim().length < 3}
              >
                Preguntar
              </ClinicalButton>
            </div>

            {copilotResult && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-800">{copilotResult.summary}</p>
                  {copilotResult.answer && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-900">{copilotResult.answer}</p>
                  )}
                  {copilotResult.soap_draft && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(copilotResult.soap_draft).map(([key, value]) => (
                        <div key={key} className="rounded-md bg-white p-2 text-xs leading-5 text-slate-700">
                          <span className="font-semibold uppercase text-slate-500">{key}</span>
                          <p className="mt-1 whitespace-pre-wrap">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {copilotResult.suggested_questions.length > 0 && (
                    <ClinicalInsight tone="blue" title="Preguntas sugeridas">
                      {copilotResult.suggested_questions.slice(0, 4).join(' · ')}
                    </ClinicalInsight>
                  )}
                  {copilotResult.clinical_gaps.length > 0 && (
                    <ClinicalInsight tone="amber" title="Datos faltantes">
                      {copilotResult.clinical_gaps.slice(0, 4).join(' · ')}
                    </ClinicalInsight>
                  )}
                  {copilotResult.soft_alerts.length > 0 && (
                    <ClinicalInsight tone="red" title="Alertas suaves">
                      {copilotResult.soft_alerts.slice(0, 3).join(' · ')}
                    </ClinicalInsight>
                  )}
                </div>
              </div>
            )}
          </div>
        </ClinicalPanel>
      )}

      {!isClosed && (
        <ClinicalPanel title="Cierre de consulta" icon={CheckCircle} accent={readyToClose ? 'green' : 'amber'}>
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                {soapChecks.map(item => (
                  <span
                    key={item.key}
                    className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
                      item.done
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {item.done ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                    {item.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {readyToClose
                  ? 'La consulta tiene los elementos mínimos para cerrarse. Revisa tratamiento, indicaciones y seguimiento antes de finalizar.'
                  : `Puedes guardar el avance. Para cierre ideal faltan: ${missingCloseItems.map(item => item.label).join(', ')}.`}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[340px]">
              <ClinicalButton
                icon={savingNotes ? Loader2 : Save}
                onClick={handleSaveNotes}
                disabled={savingNotes}
                variant="outline"
                tone="blue"
              >
                Guardar sin cerrar
              </ClinicalButton>
              <ClinicalButton
                icon={closing ? Loader2 : XCircle}
                onClick={handleClose}
                disabled={closing}
                variant={readyToClose ? 'solid' : 'outline'}
                tone={readyToClose ? 'green' : 'amber'}
              >
                Cerrar consulta
              </ClinicalButton>
            </div>
          </div>
        </ClinicalPanel>
      )}

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
              <button
                type="button"
                onClick={() => setShowTreatmentDetails(prev => !prev)}
                aria-expanded={showTreatmentDetails}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{treatment.name}</p>
                  <p className="text-xs text-slate-400">
                    Desde {new Date(treatment.start_date).toLocaleDateString('es')}
                    {treatment.end_date ? ` hasta ${new Date(treatment.end_date).toLocaleDateString('es')}` : ''}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600">
                  {showTreatmentDetails ? 'Ocultar detalles' : 'Ver detalles'}
                  {showTreatmentDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {showTreatmentDetails && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-400">Inicio</p>
                      <p className="mt-1 text-sm text-slate-700">{new Date(treatment.start_date).toLocaleDateString('es')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-400">Fin estimado</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {treatment.end_date ? new Date(treatment.end_date).toLocaleDateString('es') : 'Sin fecha'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-400">Medicamentos</p>
                      <p className="mt-1 text-sm text-slate-700">{treatment.medications.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-400">Indicaciones</p>
                      <p className="mt-1 text-sm text-slate-700">{(treatment.interventions ?? []).length}</p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-blue-100 pt-4">
                    <p className="text-xs font-medium uppercase text-slate-400">Indicaciones generales</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {treatment.instructions || 'Sin indicaciones generales registradas.'}
                    </p>
                  </div>
                </div>
              )}

              {(treatment.medications ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {(treatment.medications ?? []).map(med => (
                    <div key={med.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <Pill size={14} className="text-blue-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{med.drug_name}</p>
                        <p className="text-xs text-slate-500">
                          {med.dose_amount} {med.dose_unit}
                          {med.presentation ? ` · ${med.presentation}` : ''}
                          {med.route ? ` · ${med.route}` : ''}
                          {' · '}{FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                          {med.frequency_type === 'EVERY_X_HOURS' && med.frequency_value && ` c/${med.frequency_value}h`}
                          {med.frequency_type === 'DAILY' && med.times_per_day && ` (${med.times_per_day.join(', ')})`}
                          {med.duration_days && ` · ${med.duration_days} días`}
                        </p>
                        {showTreatmentDetails && (
                          <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
                            <p>{med.with_food ? 'Tomar con alimentos.' : 'Sin indicación de alimentos.'}</p>
                            {med.special_instructions && (
                              <p className="whitespace-pre-wrap text-slate-600">{med.special_instructions}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(treatment.interventions ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {(treatment.interventions ?? []).map(iv => (
                    <div key={iv.id} className="flex items-start gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
                      <Activity size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{iv.title}</p>
                        <p className="text-xs text-slate-500">
                          {INTERV_TYPE_LABELS[iv.type] ?? iv.type}
                          {iv.frequency ? ` · ${iv.frequency}` : ''}
                          {iv.duration ? ` · ${iv.duration}` : ''}
                        </p>
                        {showTreatmentDetails && iv.instructions && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{iv.instructions}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                  <StepMarker number={1} title="Definir control aproximado" />
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
                          border: `1.5px solid ${selectedProtocolId === protocol.id ? 'var(--mt-primary)' : 'var(--mt-border)'}`,
                          background: selectedProtocolId === protocol.id ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
                          cursor: 'pointer', transition: 'border-color .2s, background .2s',
                          boxShadow: selectedProtocolId === protocol.id ? 'var(--mt-shadow-focus)' : 'var(--mt-shadow-xs)',
                        }}
                        onMouseEnter={e => {
                          if (selectedProtocolId === protocol.id) return
                          const el = e.currentTarget as HTMLElement
                          el.style.borderColor = 'var(--mt-primary)'
                          el.style.background = 'var(--mt-primary-subtle)'
                        }}
                        onMouseLeave={e => {
                          if (selectedProtocolId === protocol.id) return
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
                          {(() => {
                            const n = protocol.medications.filter(m => m.drug_name.trim()).length
                            return n === 0 ? 'Sin medicamentos' : `${n} medicamento${n > 1 ? 's' : ''}`
                          })()}
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
                    value={treatmentName}
                    onChange={e => setTreatmentName(e.target.value)}
                    placeholder="Ej: Seguimiento de neumonía"
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
                  onClick={() => { setShowMedForm(true); setShowIntervForm(false) }}
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

              {/* Intervention list */}
              {interventions.length > 0 && (
                <div className="flex flex-col gap-2">
                  {interventions.map((iv, i) => (
                    <InterventionCard
                      key={i}
                      interv={iv}
                      onRemove={() => setInterventions(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}

              {/* Add intervention form */}
              {showIntervForm ? (
                <IntervFormPanel
                  intervForm={intervForm}
                  setIntervForm={setIntervForm}
                  onAdd={addInterventionItem}
                  onCancel={() => { setShowIntervForm(false); setIntervForm(emptyIntervForm()) }}
                />
              ) : (
                <button
                  onClick={() => { setShowIntervForm(true); setShowMedForm(false) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 500, color: '#059669',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                  }}
                >
                  <Plus size={15} />
                  Agregar indicación
                </button>
              )}

              {treatmentError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{treatmentError}</p>
              )}

              {medications.length === 0 && interventions.length === 0 ? (
                <ClinicalInsight tone="amber" title="Plan pendiente">
                  Agrega al menos un medicamento o una indicación para guardar el plan de tratamiento.
                </ClinicalInsight>
              ) : (
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

      <ClinicalPanel title="Acceso del paciente" icon={Link2} accent="green">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Portal para seguimiento</p>
              <p className="mt-1 text-xs text-slate-500">
                Envía WhatsApp con link directo y PIN de respaldo para que el paciente vea su tratamiento, dosis e historial compartido.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ClinicalButton
                icon={portalLoading ? Loader2 : Link2}
                onClick={() => handleGeneratePortalAccess('magic_link')}
                disabled={portalLoading}
                variant="outline"
                tone="green"
              >
                Generar link directo
              </ClinicalButton>
              <ClinicalButton
                icon={portalLoading ? Loader2 : MessageCircle}
                onClick={() => handleGeneratePortalAccess('whatsapp')}
                disabled={portalLoading}
                variant="outline"
                tone="green"
              >
                Enviar WhatsApp
              </ClinicalButton>
            </div>
          </div>

          {portalError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{portalError}</p>
          )}

          {portalAccess && (
            <div className="rounded-xl border border-green-100 bg-green-50/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase text-green-700">
                  {portalAccess.channel === 'whatsapp' ? 'WhatsApp enviado al paciente' : 'Link directo listo para entregar'}
                </p>
                <p className="text-xs text-slate-500">
                  Expira: {new Date(portalAccess.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={withFreshPortalSession(portalAccess.access_url)}
                  className="min-w-0 flex-1 rounded-lg border border-green-100 bg-white px-3 py-2 text-xs text-slate-700"
                />
                <div className="flex gap-2">
                  <ClinicalButton
                    icon={Copy}
                    onClick={handleCopyPortalLink}
                    variant="outline"
                    tone="green"
                  >
                    {portalCopied ? 'Copiado' : 'Copiar'}
                  </ClinicalButton>
                  <ClinicalButton
                    icon={ExternalLink}
                    onClick={handleOpenPortalAccess}
                    variant="outline"
                    tone="slate"
                  >
                    Probar acceso
                  </ClinicalButton>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {portalAccess.channel === 'whatsapp'
                  ? 'El mensaje incluye este link directo y un PIN de respaldo.'
                  : 'Puedes pegar este link en WhatsApp, SMS o correo. El paciente entra con este enlace sin escribir credenciales.'}
              </p>
              {portalAccess.pin && (
                <p className="mt-2 text-xs font-medium text-green-700">PIN enviado: {portalAccess.pin}</p>
              )}
            </div>
          )}
        </div>
      </ClinicalPanel>
    </ClinicalPage>
  )
}
