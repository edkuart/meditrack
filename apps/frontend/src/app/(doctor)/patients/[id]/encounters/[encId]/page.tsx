'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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
  listAiUsageEvents,
  runPatientClinicalCopilot,
  type AiUsageEvent,
  type ClinicalCopilotMode,
  type ClinicalCopilotModelTier,
  type ClinicalCopilotResponse,
  type ClinicalCopilotContextScope,
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
const encounterDraftStorageKey = (encounterId: string) => `meditrack.encounterDraft.${encounterId}`

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

function isClosedEncounterStatus(status?: string) {
  return status === 'CLOSED' || status === 'ARCHIVED'
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
  { mode: 'PREPARE_CONSULTATION', label: 'Preparar consulta', tone: 'blue' },
  { mode: 'SUGGEST_PATIENT_QUESTIONS', label: 'Preguntas al paciente', tone: 'amber' },
  { mode: 'REVIEW_CLINICAL_GAPS', label: 'Revisar faltantes', tone: 'amber' },
  { mode: 'DRAFT_SOAP', label: 'Redactar nota', tone: 'green' },
]

const COPILOT_MODEL_OPTIONS: Array<{
  value: ClinicalCopilotModelTier
  label: string
  description: string
}> = [
  { value: 'standard', label: 'Rápido', description: 'Para preguntas puntuales y borradores sencillos.' },
  { value: 'premium', label: 'Análisis clínico', description: 'Para casos complejos o antes de cerrar.' },
]

const COPILOT_CONTEXT_OPTIONS: Array<{
  value: ClinicalCopilotContextScope
  label: string
  description: string
}> = [
  { value: 'FULL_RECORD', label: 'Todo el expediente', description: 'Usa historial del paciente y lo escrito en esta consulta.' },
  { value: 'CURRENT_ENCOUNTER', label: 'Solo esta consulta', description: 'Prioriza motivo, nota actual y plan en edición.' },
  { value: 'SAVED_RECORD', label: 'Solo datos guardados', description: 'Evita usar el texto local que todavía no has guardado.' },
  { value: 'DRAFT_ONLY', label: 'Texto en edición', description: 'Se enfoca en lo que acabas de escribir en pantalla.' },
]

const COPILOT_CONTEXT_INSTRUCTIONS: Record<ClinicalCopilotContextScope, string> = {
  FULL_RECORD: 'Usa el expediente del paciente junto con la informacion escrita en esta consulta.',
  CURRENT_ENCOUNTER: 'Responde priorizando solo esta consulta activa. Usa antecedentes solamente si son necesarios para seguridad.',
  SAVED_RECORD: 'Responde con datos ya guardados en el expediente. Evita asumir cambios del borrador local no guardado.',
  DRAFT_ONLY: 'Responde enfocandote en el texto actual en edicion. No agregues datos que no esten en el borrador salvo alertas generales de seguridad.',
}

const COPILOT_MODE_LABELS: Record<ClinicalCopilotMode, string> = {
  ASK_CLINICAL_QUESTION: 'Respuesta a una pregunta',
  PREPARE_CONSULTATION: 'Preparación de consulta',
  SUGGEST_PATIENT_QUESTIONS: 'Preguntas para el paciente',
  REVIEW_CLINICAL_GAPS: 'Revisión de datos faltantes',
  DRAFT_SOAP: 'Borrador para la nota clínica',
}

const SOAP_SECTION_LABELS: Record<string, string> = {
  subjective: 'Lo que cuenta el paciente',
  objective: 'Hallazgos y datos objetivos',
  assessment: 'Impresión médica',
  plan: 'Plan de manejo',
}

const COPILOT_SECTION_TONES = {
  slate: {
    shell: 'border-slate-200 bg-white',
    header: 'bg-slate-50 text-slate-900',
    meta: 'text-slate-500',
    body: 'text-slate-700',
  },
  blue: {
    shell: 'border-blue-100 bg-blue-50',
    header: 'bg-blue-100/60 text-blue-950',
    meta: 'text-blue-700',
    body: 'text-blue-950',
  },
  amber: {
    shell: 'border-amber-100 bg-amber-50',
    header: 'bg-amber-100/70 text-amber-950',
    meta: 'text-amber-700',
    body: 'text-amber-950',
  },
  red: {
    shell: 'border-red-100 bg-red-50',
    header: 'bg-red-100/70 text-red-950',
    meta: 'text-red-700',
    body: 'text-red-950',
  },
  green: {
    shell: 'border-green-100 bg-green-50',
    header: 'bg-green-100/70 text-green-950',
    meta: 'text-green-700',
    body: 'text-green-950',
  },
} as const

function CopilotDisclosure({
  title,
  meta,
  tone = 'slate',
  children,
}: {
  title: string
  meta?: string
  tone?: keyof typeof COPILOT_SECTION_TONES
  children: ReactNode
}) {
  const styles = COPILOT_SECTION_TONES[tone]

  return (
    <details open className={`group overflow-hidden rounded-lg border ${styles.shell}`}>
      <summary className={`flex cursor-pointer list-none items-center gap-3 px-4 py-3 ${styles.header}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {meta && <p className={`mt-0.5 truncate text-xs ${styles.meta}`}>{meta}</p>}
        </div>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className={`border-t border-white/70 p-4 ${styles.body}`}>
        {children}
      </div>
    </details>
  )
}

function ClinicalNoteSection({
  title,
  helper,
  done,
  children,
}: {
  title: string
  helper: string
  done?: boolean
  children: ReactNode
}) {
  return (
    <details open className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {done ? 'Con información' : 'Pendiente'}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
        <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 p-3">
        {children}
      </div>
    </details>
  )
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function getCopilotEventQuestion(event: AiUsageEvent) {
  const question = event.metadata?.question
  return typeof question === 'string' && question.trim().length > 0 ? question.trim() : null
}

function getCopilotEventMode(event: AiUsageEvent) {
  const mode = event.metadata?.mode
  if (typeof mode !== 'string') return 'Copiloto clínico'
  return COPILOT_MODE_LABELS[mode as ClinicalCopilotMode] ?? 'Copiloto clínico'
}

function getCopilotEventAction(event: AiUsageEvent) {
  const mode = event.metadata?.mode
  if (mode === 'DRAFT_SOAP') return 'Ver borrador'
  if (mode === 'SUGGEST_PATIENT_QUESTIONS') return 'Ver preguntas'
  if (mode === 'REVIEW_CLINICAL_GAPS') return 'Ver faltantes'
  if (mode === 'PREPARE_CONSULTATION') return 'Ver preparación'
  return 'Abrir respuesta'
}

function getCopilotEventContext(event: AiUsageEvent) {
  const value = event.metadata?.context_scope
  const option = COPILOT_CONTEXT_OPTIONS.find(item => item.value === value)
  return option?.label ?? 'Contexto no especificado'
}

function getCopilotEventModelTier(event: AiUsageEvent) {
  const value = event.metadata?.model_tier
  const option = COPILOT_MODEL_OPTIONS.find(item => item.value === value)
  return option?.label ?? 'Rápido'
}

function getModelLabel(event: Pick<AiUsageEvent, 'provider' | 'model'>) {
  return `Generado con ${event.provider} · ${event.model}`
}

function getCopilotEventSnapshot(event: AiUsageEvent): ClinicalCopilotResponse | null {
  const raw = event.metadata?.response_snapshot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const snapshot = raw as Record<string, unknown>
  const summary = typeof snapshot.summary === 'string' ? snapshot.summary : undefined
  const answer = typeof snapshot.answer === 'string' ? snapshot.answer : undefined
  if (!summary && !answer) return null

  const mode = typeof event.metadata?.mode === 'string'
    ? event.metadata.mode as ClinicalCopilotMode
    : 'ASK_CLINICAL_QUESTION'
  const tier = event.metadata?.model_tier === 'premium' ? 'premium' : 'standard'

  return {
    mode,
    model: event.model,
    provider: event.provider,
    model_tier: tier,
    safety_notice: typeof snapshot.safety_notice === 'string' ? snapshot.safety_notice : '',
    summary: summary ?? 'Respuesta previa del copiloto clínico',
    answer,
    suggested_questions: metadataStringArray(snapshot.suggested_questions),
    clinical_gaps: metadataStringArray(snapshot.clinical_gaps),
    soft_alerts: metadataStringArray(snapshot.soft_alerts),
    evidence: [],
  }
}

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

type NoteSectionKey = 'subjective' | 'objective' | 'assessment' | 'plan' | 'notes' | 'summary'

interface EncounterLocalDraft {
  encounter_id: string
  saved_at: string
  notes: string
  summary: string
  subjective: string
  objective: string
  assessment: string
  plan: string
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
  const [copilotModelTier, setCopilotModelTier] = useState<ClinicalCopilotModelTier>('standard')
  const [copilotContextScope, setCopilotContextScope] = useState<ClinicalCopilotContextScope>('FULL_RECORD')
  const [copilotResult, setCopilotResult] = useState<ClinicalCopilotResponse | null>(null)
  const [copilotHistory, setCopilotHistory] = useState<AiUsageEvent[]>([])
  const [copilotHistoryLoading, setCopilotHistoryLoading] = useState(false)
  const [copilotHistoryError, setCopilotHistoryError] = useState('')
  const [pendingLocalDraft, setPendingLocalDraft] = useState<EncounterLocalDraft | null>(null)
  const [localDraftNotice, setLocalDraftNotice] = useState('')
  const autosaveReadyRef = useRef(false)

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
    autosaveReadyRef.current = false
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
      try {
        const rawDraft = window.localStorage.getItem(encounterDraftStorageKey(encId))
        if (rawDraft) {
          const draft = JSON.parse(rawDraft) as EncounterLocalDraft
          const hasDifferentDraft =
            draft.encounter_id === encId &&
            (
              draft.notes !== (enc.notes ?? '') ||
              draft.summary !== (enc.summary ?? '') ||
              draft.subjective !== (enc.subjective ?? '') ||
              draft.objective !== (enc.objective ?? '') ||
              draft.assessment !== (enc.assessment ?? '') ||
              draft.plan !== (enc.plan ?? '')
            )
          setPendingLocalDraft(hasDifferentDraft ? draft : null)
        } else {
          setPendingLocalDraft(null)
        }
      } catch {
        window.localStorage.removeItem(encounterDraftStorageKey(encId))
        setPendingLocalDraft(null)
      }
    } finally {
      window.setTimeout(() => { autosaveReadyRef.current = true }, 0)
      setLoading(false)
    }
  }, [token, encId])

  const loadCopilotHistory = useCallback(async () => {
    if (!token || !patientId || !encId) return
    setCopilotHistoryLoading(true)
    setCopilotHistoryError('')
    try {
      const events = await listAiUsageEvents(token, 50, patientId)
      setCopilotHistory(events.filter(event =>
        event.feature === 'CLINICAL_COPILOT' &&
        (event.encounter_id === encId || event.resource_id === encId),
      ))
    } catch (err) {
      setCopilotHistoryError(err instanceof Error ? err.message : 'No se pudo cargar el historial del copiloto')
    } finally {
      setCopilotHistoryLoading(false)
    }
  }, [token, patientId, encId])

  useEffect(() => {
    const id = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadCopilotHistory() }, 0)
    return () => window.clearTimeout(id)
  }, [loadCopilotHistory])

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

  useEffect(() => {
    if (!encounter || pendingLocalDraft || !autosaveReadyRef.current || isClosedEncounterStatus(encounter.status)) return
    const id = window.setTimeout(() => {
      const draft: EncounterLocalDraft = {
        encounter_id: encId,
        saved_at: new Date().toISOString(),
        notes,
        summary,
        subjective,
        objective,
        assessment,
        plan,
      }
      window.localStorage.setItem(encounterDraftStorageKey(encId), JSON.stringify(draft))
      setLocalDraftNotice('Borrador protegido en este navegador')
    }, 900)
    return () => window.clearTimeout(id)
  }, [assessment, encId, encounter, notes, objective, pendingLocalDraft, plan, subjective, summary])

  function restoreLocalDraft() {
    if (!pendingLocalDraft) return
    setNotes(pendingLocalDraft.notes)
    setSummary(pendingLocalDraft.summary)
    setSubjective(pendingLocalDraft.subjective)
    setObjective(pendingLocalDraft.objective)
    setAssessment(pendingLocalDraft.assessment)
    setPlan(pendingLocalDraft.plan)
    setWorkflowStage(inferWorkflowStage({
      subjective: pendingLocalDraft.subjective,
      objective: pendingLocalDraft.objective,
      assessment: pendingLocalDraft.assessment,
      plan: pendingLocalDraft.plan,
      summary: pendingLocalDraft.summary,
    }))
    setPendingLocalDraft(null)
    setLocalDraftNotice('Borrador recuperado. Revísalo y guarda el avance.')
  }

  function discardLocalDraft() {
    window.localStorage.removeItem(encounterDraftStorageKey(encId))
    setPendingLocalDraft(null)
    setLocalDraftNotice('')
  }

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
      setPendingLocalDraft(null)
      window.localStorage.removeItem(encounterDraftStorageKey(encId))
      setLocalDraftNotice('')
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
      const currentDraftSource = [
        encounter?.chief_complaint ? `Motivo: ${encounter.chief_complaint}` : '',
        subjective ? `Subjetivo:\n${subjective}` : '',
        objective ? `Objetivo:\n${objective}` : '',
        assessment ? `Evaluación:\n${assessment}` : '',
        plan ? `Plan:\n${plan}` : '',
        notes ? `Notas libres:\n${notes}` : '',
        summary ? `Resumen:\n${summary}` : '',
      ].filter(Boolean).join('\n\n')
      const savedSource = [
        encounter?.chief_complaint ? `Motivo: ${encounter.chief_complaint}` : '',
        encounter?.subjective ? `Subjetivo guardado:\n${encounter.subjective}` : '',
        encounter?.objective ? `Objetivo guardado:\n${encounter.objective}` : '',
        encounter?.assessment ? `Evaluación guardada:\n${encounter.assessment}` : '',
        encounter?.plan ? `Plan guardado:\n${encounter.plan}` : '',
        encounter?.notes ? `Notas guardadas:\n${encounter.notes}` : '',
        encounter?.summary ? `Resumen guardado:\n${encounter.summary}` : '',
      ].filter(Boolean).join('\n\n')
      const sourceBody = copilotContextScope === 'SAVED_RECORD' ? savedSource : currentDraftSource
      const sourceText = [
        `Contexto solicitado por el medico: ${COPILOT_CONTEXT_INSTRUCTIONS[copilotContextScope]}`,
        sourceBody,
      ].filter(Boolean).join('\n\n')

      const result = await runPatientClinicalCopilot(token, patientId, {
        mode,
        model_tier: copilotModelTier,
        context_scope: copilotContextScope,
        encounter_id: encId,
        question,
        source_text: sourceText || undefined,
        save_to_review_queue: mode === 'DRAFT_SOAP',
      })
      setCopilotResult(result)
      setAiNotice(result.safety_notice)
      void loadCopilotHistory()

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

  function setNoteSection(section: NoteSectionKey, updater: (prev: string) => string) {
    if (section === 'subjective') {
      setSubjective(updater)
      setWorkflowStage('SUBJECTIVE')
    } else if (section === 'objective') {
      setObjective(updater)
      setWorkflowStage('OBJECTIVE')
    } else if (section === 'assessment') {
      setAssessment(updater)
      setWorkflowStage('ASSESSMENT')
    } else if (section === 'plan') {
      setPlan(updater)
      setWorkflowStage('PLAN')
    } else if (section === 'notes') {
      setNotes(updater)
    } else {
      setSummary(updater)
    }
  }

  function insertCopilotText(section: NoteSectionKey, text?: string, replaceEmptyOnly = false) {
    const clean = text?.trim()
    if (!clean) return
    setNoteSection(section, prev => {
      if (!prev.trim()) return clean
      if (replaceEmptyOnly) return prev
      return `${prev.trim()}\n\n${clean}`
    })
    setAiNotice('Texto insertado en la nota. Revísalo y guarda el avance.')
  }

  function insertSoapDraft() {
    if (!copilotResult?.soap_draft) return
    insertCopilotText('subjective', copilotResult.soap_draft.subjective, true)
    insertCopilotText('objective', copilotResult.soap_draft.objective, true)
    insertCopilotText('assessment', copilotResult.soap_draft.assessment, true)
    insertCopilotText('plan', copilotResult.soap_draft.plan, true)
  }

  function scrollToTreatmentPlan() {
    document.getElementById('encounter-treatment-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setShowTreatmentDetails(true)
  }

  async function handleClose() {
    if (!token) return
    const missing = closeChecks.filter(item => !item.done).map(item => item.label)
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
      window.localStorage.removeItem(encounterDraftStorageKey(encId))
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

  const isClosed = isClosedEncounterStatus(encounter.status)
  const hasTreatmentWork = Boolean(treatment)
  const hasFollowUpLanguage = /seguimiento|control|cita|revis/i.test(`${plan}\n${summary}`)
  const hasSafetyLanguage = /alarma|urgencia|empeora|empeoramiento|fiebre|vomit|debilidad|confusi/i.test(`${plan}\n${summary}`)
  const closeChecks = [
    { key: 'subjective', label: 'Lo que cuenta el paciente', done: Boolean(subjective.trim() || encounter.chief_complaint?.trim()) },
    { key: 'objective', label: 'Datos objetivos', done: Boolean(objective.trim()) },
    { key: 'assessment', label: 'Impresión médica', done: Boolean(assessment.trim()) },
    { key: 'plan', label: 'Plan de manejo', done: Boolean(plan.trim() || summary.trim() || treatment) },
    { key: 'treatment', label: 'Medicamentos/tratamiento revisados', done: Boolean(hasTreatmentWork || /medic|tratamiento|dosis|analg|aines|antib/i.test(`${plan}\n${summary}`)) },
    { key: 'follow_up', label: 'Seguimiento indicado', done: Boolean(hasFollowUpLanguage) },
    { key: 'safety', label: 'Signos de alarma explicados', done: Boolean(hasSafetyLanguage) },
  ]
  const missingCloseItems = closeChecks.filter(item => !item.done)
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

      {!isClosed && pendingLocalDraft && (
        <ClinicalInsight tone="amber" title="Borrador recuperable">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Encontré texto guardado en este navegador del {new Date(pendingLocalDraft.saved_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}.
            </span>
            <span className="flex flex-wrap gap-2">
              <ClinicalButton icon={Copy} onClick={restoreLocalDraft} variant="outline" tone="amber">
                Recuperar
              </ClinicalButton>
              <ClinicalButton icon={Trash2} onClick={discardLocalDraft} variant="outline" tone="slate">
                Descartar
              </ClinicalButton>
            </span>
          </div>
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
            <div className="grid gap-3 xl:grid-cols-2">
              <ClinicalNoteSection
                title="Lo que cuenta el paciente"
                helper="Síntomas, evolución, dolor, adherencia, antecedentes relevantes y preocupaciones actuales."
                done={Boolean(subjective.trim() || encounter.chief_complaint?.trim())}
              >
                <textarea
                  value={subjective}
                  onChange={e => { setSubjective(e.target.value); setWorkflowStage('SUBJECTIVE') }}
                  rows={5}
                  placeholder="Historia del padecimiento actual, síntomas, revisión por sistemas..."
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </ClinicalNoteSection>

              <ClinicalNoteSection
                title="Hallazgos y datos objetivos"
                helper="Signos vitales, exploración física, laboratorios, estudios y observaciones verificables."
                done={Boolean(objective.trim())}
              >
                <textarea
                  value={objective}
                  onChange={e => { setObjective(e.target.value); setWorkflowStage('OBJECTIVE') }}
                  rows={5}
                  placeholder="Signos vitales, examen físico, hallazgos, laboratorios relevantes..."
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </ClinicalNoteSection>

              <ClinicalNoteSection
                title="Impresión médica"
                helper="Diagnóstico probable, diferenciales, riesgos, evolución y razonamiento clínico."
                done={Boolean(assessment.trim())}
              >
                <textarea
                  value={assessment}
                  onChange={e => { setAssessment(e.target.value); setWorkflowStage('ASSESSMENT') }}
                  rows={5}
                  placeholder="Impresión diagnóstica, CIE-10, diferenciales, riesgos..."
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </ClinicalNoteSection>

              <ClinicalNoteSection
                title="Plan de manejo"
                helper="Tratamiento, medicamentos, indicaciones, educación, estudios, seguimiento y signos de alarma."
                done={Boolean(plan.trim() || summary.trim() || treatment)}
              >
                <textarea
                  value={plan}
                  onChange={e => { setPlan(e.target.value); setWorkflowStage('PLAN') }}
                  rows={5}
                  placeholder="Plan diagnóstico, tratamiento, educación, seguimiento..."
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ClinicalButton icon={Pill} onClick={scrollToTreatmentPlan} variant="outline" tone="blue">
                    Agregar medicamento o tratamiento
                  </ClinicalButton>
                  <span className="text-xs text-slate-400">
                    El cierre verificará que el plan y el tratamiento hayan sido revisados.
                  </span>
                </div>
              </ClinicalNoteSection>
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
              {!notesSaved && localDraftNotice && (
                <span className="text-xs text-slate-400">{localDraftNotice}</span>
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
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contexto que usará la IA</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {COPILOT_CONTEXT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCopilotContextScope(option.value)}
                      disabled={Boolean(copilotLoading)}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        copilotContextScope === option.value
                          ? 'border-blue-300 bg-white text-blue-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nivel de análisis</p>
                <div className="mt-2 grid gap-2">
                  {COPILOT_MODEL_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCopilotModelTier(option.value)}
                      disabled={Boolean(copilotLoading)}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        copilotModelTier === option.value
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
                placeholder="Escribe una pregunta sobre este paciente o esta consulta..."
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

            <CopilotDisclosure
              title="Respuestas guardadas de esta consulta"
              meta={copilotHistoryLoading ? 'Cargando...' : `${copilotHistory.length} respuesta${copilotHistory.length === 1 ? '' : 's'} disponible${copilotHistory.length === 1 ? '' : 's'}`}
              tone="slate"
            >
              {copilotHistoryError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{copilotHistoryError}</p>
              )}
              {!copilotHistoryError && copilotHistory.length === 0 && (
                <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  Todavía no hay respuestas guardadas para esta consulta. Las próximas preguntas aparecerán aquí aunque recargues la página.
                </p>
              )}
              {copilotHistory.length > 0 && (
                <div className="grid gap-2">
                  {copilotHistory.slice(0, 8).map(event => {
                    const snapshot = getCopilotEventSnapshot(event)
                    const question = getCopilotEventQuestion(event)
                    return (
                      <button
                        key={event.id}
                        type="button"
                        disabled={!snapshot}
                        onClick={() => {
                          if (!snapshot) return
                          setCopilotResult(snapshot)
                          setAiNotice(snapshot.safety_notice)
                        }}
                        className="w-full rounded-lg border border-slate-100 bg-white px-3 py-2 text-left transition hover:border-blue-100 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">{getCopilotEventMode(event)}</span>
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {new Date(event.created_at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                            {getCopilotEventAction(event)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-slate-500">
                          {question ?? snapshot?.summary ?? 'Respuesta previa del copiloto'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {getCopilotEventContext(event)} · {getCopilotEventModelTier(event)} · {getModelLabel(event)}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </CopilotDisclosure>

            {copilotResult && (
              <div className="flex flex-col gap-4">
                <CopilotDisclosure
                  title="Respuesta"
                  meta={`Generado con ${copilotResult.provider ? `${copilotResult.provider} · ` : ''}${copilotResult.model}`}
                  tone="blue"
                >
                  <p className="text-base font-semibold leading-7">{copilotResult.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ClinicalButton
                      icon={Save}
                      onClick={() => insertCopilotText('summary', copilotResult.summary)}
                      variant="outline"
                      tone="blue"
                    >
                      Agregar al resumen
                    </ClinicalButton>
                    {copilotResult.answer && (
                      <ClinicalButton
                        icon={FileText}
                        onClick={() => insertCopilotText('notes', copilotResult.answer)}
                        variant="outline"
                        tone="slate"
                      >
                        Guardar análisis en notas
                      </ClinicalButton>
                    )}
                  </div>
                </CopilotDisclosure>

                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="flex min-w-0 flex-col gap-4">
                    {copilotResult.answer && (
                      <CopilotDisclosure title="Análisis y recomendación" tone="slate">
                        <p className="whitespace-pre-wrap break-words text-sm leading-7">{copilotResult.answer}</p>
                      </CopilotDisclosure>
                    )}

                    {copilotResult.soap_draft && (
                      <CopilotDisclosure
                        title="Borrador para la nota clínica"
                        meta="Texto sugerido por IA para que el médico lo revise antes de guardar."
                        tone="green"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <ClinicalButton icon={Copy} onClick={insertSoapDraft} variant="outline" tone="green">
                            Llenar secciones vacías
                          </ClinicalButton>
                          <span className="text-xs text-green-700">
                            No reemplaza texto que ya escribiste.
                          </span>
                        </div>
                        <div className="grid gap-3">
                          {Object.entries(copilotResult.soap_draft).map(([key, value]) => (
                            <CopilotDisclosure key={key} title={SOAP_SECTION_LABELS[key] ?? key} tone="slate">
                              <div className="mb-3 flex justify-end">
                                <ClinicalButton
                                  icon={Copy}
                                  onClick={() => insertCopilotText(key as NoteSectionKey, value)}
                                  variant="outline"
                                  tone="blue"
                                >
                                  Insertar aquí
                                </ClinicalButton>
                              </div>
                              <p className="whitespace-pre-wrap break-words text-sm leading-7">{value}</p>
                            </CopilotDisclosure>
                          ))}
                        </div>
                      </CopilotDisclosure>
                    )}
                  </div>

                  <aside className="flex min-w-0 flex-col gap-3">
                  {copilotResult.suggested_questions.length > 0 && (
                    <CopilotDisclosure title="Preguntas sugeridas" tone="blue">
                      <ul className="space-y-2 text-sm leading-6">
                        {copilotResult.suggested_questions.slice(0, 4).map((item, index) => (
                          <li key={index} className="rounded-md bg-white/75 px-3 py-2">
                            <div className="flex flex-col gap-2">
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => setCopilotQuestion(item)}
                                className="self-start text-xs font-semibold text-blue-700 hover:text-blue-900"
                              >
                                Usar como pregunta
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CopilotDisclosure>
                  )}
                  {copilotResult.clinical_gaps.length > 0 && (
                    <CopilotDisclosure title="Datos faltantes" tone="amber">
                      <ul className="space-y-2 text-sm leading-6">
                        {copilotResult.clinical_gaps.slice(0, 4).map((item, index) => (
                          <li key={index} className="rounded-md bg-white/75 px-3 py-2">{item}</li>
                        ))}
                      </ul>
                    </CopilotDisclosure>
                  )}
                  {copilotResult.soft_alerts.length > 0 && (
                    <CopilotDisclosure title="Alertas suaves" tone="red">
                      <ul className="space-y-2 text-sm leading-6">
                        {copilotResult.soft_alerts.slice(0, 3).map((item, index) => (
                          <li key={index} className="rounded-md bg-white/75 px-3 py-2">{item}</li>
                        ))}
                      </ul>
                    </CopilotDisclosure>
                  )}
                  </aside>
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
                {closeChecks.map(item => (
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
              {(medications.length > 0 || interventions.length > 0) && !treatment && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Hay tratamiento en edición que todavía no se ha guardado como plan.
                </p>
              )}
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
      <section id="encounter-treatment-plan" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden scroll-mt-24">
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
