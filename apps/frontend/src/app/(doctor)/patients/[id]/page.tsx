'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, FileText, Plus, ChevronUp,
  QrCode, Link2, Loader2, ExternalLink, Download, MessageCircle,
  Activity, CalendarClock, ClipboardList, Pill, Stethoscope, UserRound,
  ShieldCheck, Trash2, AlertTriangle, Copy, FlaskConical, BookOpen, Pencil,
  Ruler, Scale, X, ArrowUpDown, CheckCircle, XCircle, Send, BedDouble, LogOut,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import {
  getPatient, listEncounters, createEncounter, listDocuments,
  generatePortalAccess, getPatientFhirBundle, listPatientTreatments,
  listPatientCheckIns, listPatientProblems, createPatientProblem,
  listPatientBackground, listPatientBackgroundHistory, retirePatientBackground, upsertPatientBackground,
  listPatientVitalSigns, createPatientVitalSigns, getPatientClinicalWorkspace,
  listPatientReferrals, createReferral, listStaff,
  listPatientAdmissions, admitPatient, dischargePatient,
  type Patient, type Encounter, type Document, type AccessResult,
  type TreatmentPlan, type PatientCheckIn,
  type PatientProblem, type PatientBackground, type BackgroundCategory, type ProblemStatus,
  type VitalSignsRecord, type VitalSignsInput, type PatientClinicalWorkspace,
  type Referral, type ReferralPriority, type StaffMember, type Admission,
} from '@/lib/doctor/api'
import {
  getPatientConsents, recordConsent, withdrawConsent, exportPatientData, anonymizePatient,
  type PatientConsent, type ConsentType,
} from '@/lib/doctor/compliance-api'
import { listLabOrders, ORDER_STATUS_CONFIG, type LabOrder } from '@/lib/doctor/lab-api'
import { listDepartments, type Department } from '@/lib/doctor/departments-api'
import { DocumentUploader } from '@/components/doctor/DocumentUploader'
import { DocumentList } from '@/components/doctor/DocumentList'
import { AdherenceCalendar } from '@/components/doctor/AdherenceCalendar'
import { getPatientAdherence, type PatientAdherenceReport } from '@/lib/doctor/analytics-api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalInsight,
  ClinicalPage,
  ClinicalPanel,
  ClinicalTimeline,
  EmptyClinicalState,
  LoadingState,
  MTStatBox,
  MTStatChip,
  StatusPill,
  type TimelineItem,
  type Tone,
} from '@/components/doctor/clinical-ui'
import QRCode from 'qrcode'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ENC_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP: 'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización',
  DISCHARGE: 'Alta',
  CHRONIC_CONTROL: 'Control crónico',
  EMERGENCY: 'Urgencia',
}

const ENC_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  DRAFT:    { bg: 'var(--mt-elevated)',       color: 'var(--mt-muted)'   },
  OPEN:     { bg: 'var(--mt-success-subtle)', color: 'var(--mt-success)' },
  CLOSED:   { bg: 'var(--mt-elevated)',       color: 'var(--mt-muted)'   },
  ARCHIVED: { bg: 'var(--mt-elevated)',       color: 'var(--mt-muted)'   },
}

const TREATMENT_STATUS: Record<TreatmentPlan['status'], { label: string; tone: Tone }> = {
  ACTIVE:    { label: 'Activo',     tone: 'green' },
  DRAFT:     { label: 'Borrador',   tone: 'amber' },
  COMPLETED: { label: 'Completado', tone: 'slate' },
  SUSPENDED: { label: 'Suspendido', tone: 'amber' },
  CANCELLED: { label: 'Cancelado',  tone: 'red'   },
}

const PROBLEM_STATUS: Record<ProblemStatus, { label: string; tone: Tone }> = {
  ACTIVE:   { label: 'Activo',   tone: 'red'   },
  CHRONIC:  { label: 'Crónico',  tone: 'amber' },
  INACTIVE: { label: 'Inactivo', tone: 'slate' },
  RESOLVED: { label: 'Resuelto', tone: 'green' },
}

const BG_CATEGORY_ORDER: BackgroundCategory[] = [
  'ALERGIAS', 'APP', 'AHF', 'MEDICAMENTOS', 'APNP', 'AQ', 'ATRAUMA', 'GINECO_OBS', 'PERINATAL',
]

const BG_LABELS: Record<BackgroundCategory, { label: string; tone: Tone }> = {
  ALERGIAS:    { label: 'Alergias',                            tone: 'red'    },
  APP:         { label: 'Antecedentes Patológicos Personales', tone: 'amber'  },
  AHF:         { label: 'Antecedentes Heredofamiliares',       tone: 'purple' },
  MEDICAMENTOS:{ label: 'Medicamentos actuales',               tone: 'blue'   },
  APNP:        { label: 'Antecedentes No Patológicos',         tone: 'green'  },
  AQ:          { label: 'Antecedentes Quirúrgicos',            tone: 'slate'  },
  ATRAUMA:     { label: 'Antecedentes Traumáticos',            tone: 'slate'  },
  GINECO_OBS:  { label: 'Gineco-Obstétricos',                  tone: 'sky'    },
  PERINATAL:   { label: 'Perinatales',                         tone: 'slate'  },
}

const BG_HELP_TEXT: Record<BackgroundCategory, string> = {
  ALERGIAS: 'Medicamentos, alimentos, ambiente, reacción y severidad. Ej.: penicilina: urticaria; niega anafilaxia.',
  APP: 'Enfermedades previas o crónicas relevantes, año aproximado, control actual y complicaciones conocidas.',
  AHF: 'Padres, hermanos e hijos: HTA, diabetes, cáncer, cardiopatía prematura, enfermedad renal u otros riesgos familiares.',
  MEDICAMENTOS: 'Medicamentos actuales, dosis, frecuencia, automedicación, suplementos y adherencia referida.',
  APNP: 'Tabaco, alcohol, drogas, actividad física, sueño, alimentación, ocupación y contexto social relevante.',
  AQ: 'Cirugías, año aproximado, complicaciones, anestesia y hospitalizaciones quirúrgicas relevantes.',
  ATRAUMA: 'Fracturas, accidentes, lesiones previas, secuelas funcionales o neurológicas.',
  GINECO_OBS: 'FUM, gestas/partos/abortos, anticoncepción, menopausia, citología, sangrados o embarazo actual.',
  PERINATAL: 'Datos de nacimiento, prematurez, complicaciones neonatales, vacunas o desarrollo cuando aplique.',
}

const ENC_TYPES = [
  { value: 'CONSULTATION',        label: 'Consulta'            },
  { value: 'FOLLOW_UP',           label: 'Seguimiento'         },
  { value: 'POST_HOSPITALIZATION',label: 'Post-hospitalización'},
  { value: 'DISCHARGE',           label: 'Alta'                },
  { value: 'CHRONIC_CONTROL',     label: 'Control crónico'     },
  { value: 'EMERGENCY',           label: 'Urgencia'            },
]

const portalAccessStorageKey = (patientId: string) => `meditrack.portalAccess.${patientId}`

function withFreshPortalSession(url: string) {
  const next = new URL(url)
  next.searchParams.set('fresh', '1')
  return next.toString()
}

// ─── Shared form field classes ─────────────────────────────────────────────────
const fieldClass = 'border border-[var(--mt-border)] rounded-lg px-3 py-2 text-sm text-[var(--mt-text)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-primary-mist)] bg-[var(--mt-surface)] w-full'
const labelClass = 'text-xs font-medium text-[var(--mt-muted)]'
const submitBtnClass = 'w-full sm:w-auto sm:self-end flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--mt-primary)] text-white text-sm font-medium disabled:opacity-60 hover:bg-[var(--mt-primary-deep)] transition-colors'
const panelToggleClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-[var(--mt-primary)] hover:text-[var(--mt-primary-deep)] transition-colors'

// ─── TreatmentCard ─────────────────────────────────────────────────────────────
function TreatmentCard({ treatment }: { treatment: TreatmentPlan }) {
  const status = TREATMENT_STATUS[treatment.status]
  return (
    <Link
      href={`/patients/${treatment.patient_id}/encounters/${treatment.encounter_id}`}
      className="block rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-4 shadow-sm transition-all hover:border-[var(--mt-primary-mist)] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--mt-text)]">{treatment.name}</p>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="text-xs text-[var(--mt-muted)]">
            Desde {new Date(treatment.start_date).toLocaleDateString('es')}
            {treatment.end_date ? ` hasta ${new Date(treatment.end_date).toLocaleDateString('es')}` : ''}
          </p>
        </div>
        <Pill size={18} className="shrink-0 text-[var(--mt-primary)]" />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {treatment.medications.slice(0, 3).map(med => (
          <div key={med.id} className="rounded-lg bg-[var(--mt-elevated)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--mt-text-2)]">{med.drug_name}</p>
            <p className="mt-0.5 text-xs text-[var(--mt-muted)]">
              {med.dose_amount} {med.dose_unit}
              {med.route ? ` · ${med.route}` : ''}
              {med.times_per_day && med.times_per_day.length > 0 ? ` · ${med.times_per_day.join(', ')}` : ''}
            </p>
          </div>
        ))}
        {treatment.medications.length > 3 && (
          <p className="text-xs text-[var(--mt-muted)]">+{treatment.medications.length - 3} medicamentos más</p>
        )}
        {(treatment.interventions ?? []).slice(0, 2).map(iv => (
          <div key={iv.id} className="flex items-center gap-2 rounded-lg border border-[var(--mt-border)] bg-[var(--mt-success-subtle)] px-3 py-2">
            <Activity size={12} className="shrink-0 text-[var(--mt-success)]" />
            <p className="text-xs font-medium text-[var(--mt-text-2)]">{iv.title}</p>
            {iv.frequency && <p className="text-xs text-[var(--mt-muted)]">· {iv.frequency}</p>}
          </div>
        ))}
        {(treatment.interventions ?? []).length > 2 && (
          <p className="text-xs text-[var(--mt-muted)]">+{(treatment.interventions ?? []).length - 2} indicaciones más</p>
        )}
      </div>
    </Link>
  )
}

// ─── Portal access section ─────────────────────────────────────────────────────
function PortalAccessSection({
  token,
  patientId,
  treatments,
}: {
  token: string
  patientId: string
  treatments: TreatmentPlan[]
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<AccessResult | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const activeTreatments = treatments.filter(t => t.status === 'ACTIVE')

  useEffect(() => {
    let cancelled = false

    async function hydrateSavedAccess() {
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
        if (cancelled) return
        setResult(saved)
        if (saved.channel === 'qr' && 'qr_data' in saved) {
          const url = await QRCode.toDataURL(saved.qr_data, { width: 240, margin: 2 })
          if (!cancelled) setQrDataUrl(url)
        }
      } catch {
        window.localStorage.removeItem(portalAccessStorageKey(patientId))
      }
    }

    void hydrateSavedAccess()
    return () => { cancelled = true }
  }, [patientId])

  async function generate(channel: 'magic_link' | 'qr' | 'whatsapp') {
    setLoading(channel)
    setError('')
    setCopied(false)
    setQrDataUrl(null)
    try {
      const data = await generatePortalAccess(token, patientId, channel)
      setResult(data)
      window.localStorage.setItem(portalAccessStorageKey(patientId), JSON.stringify(data))
      if (channel === 'qr' && 'qr_data' in data) {
        const url = await QRCode.toDataURL(data.qr_data, { width: 240, margin: 2 })
        setQrDataUrl(url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el acceso del paciente')
    } finally {
      setLoading(null)
    }
  }

  async function copyLink() {
    if (!result || !('access_url' in result)) return
    try {
      await navigator.clipboard.writeText(withFreshPortalSession(result.access_url))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.')
    }
  }

  function openAccessLink() {
    if (!result?.access_url) return
    try { window.sessionStorage.removeItem('meditrack_patient_session') } catch {}
    window.open(withFreshPortalSession(result.access_url), '_blank', 'noopener,noreferrer')
  }

  return (
    <ClinicalPanel title="Acceso al portal del paciente" icon={Link2} accent="green" collapsible defaultOpen={false}>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--mt-border)] bg-[var(--mt-elevated)] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--mt-muted)]">Tratamientos activos</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--mt-text)]">{activeTreatments.length}</p>
          </div>
          <div className="rounded-xl border border-[var(--mt-border)] bg-[var(--mt-elevated)] px-4 py-3 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--mt-muted)]">Estado del acceso</p>
            <p className="mt-1 text-sm text-[var(--mt-text-2)]">
              {result
                ? `Link disponible hasta ${new Date(result.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'Genera un enlace directo, QR o WhatsApp con link y PIN de respaldo.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { channel: 'magic_link' as const, label: 'Link directo',   icon: <Link2 size={14} /> },
            { channel: 'qr' as const,         label: 'QR directo',     icon: <QrCode size={14} /> },
            { channel: 'whatsapp' as const,   label: 'Enviar WhatsApp',icon: <MessageCircle size={14} /> },
          ].map(({ channel, label, icon }) => (
            <button
              key={channel}
              onClick={() => generate(channel)}
              disabled={!!loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 text-sm font-medium text-[var(--mt-text-2)] transition-colors hover:border-[var(--mt-primary-mist)] hover:text-[var(--mt-primary)] disabled:opacity-50"
            >
              {loading === channel ? <Loader2 size={14} className="animate-spin" /> : icon}
              {label}
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg bg-[var(--mt-danger-subtle)] px-3 py-2 text-sm text-[var(--mt-danger)]">{error}</p>}

        {result && (
          <div className="rounded-xl border border-[var(--mt-border)] bg-[var(--mt-success-subtle)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-[var(--mt-success)]">
                {result.channel === 'whatsapp' ? 'WhatsApp enviado al paciente' : 'Link directo listo para entregar'}
              </p>
              <p className="text-xs text-[var(--mt-muted)]">
                Expira: {new Date(result.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              {qrDataUrl && (
                <div className="flex justify-center rounded-xl border border-[var(--mt-border)] bg-[var(--mt-surface)] p-3">
                  <img src={qrDataUrl} alt="QR de acceso directo al portal" className="h-48 w-48 rounded-lg" />
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-center gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={withFreshPortalSession(result.access_url)}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 py-2 text-xs text-[var(--mt-text-2)]"
                  />
                  <button
                    onClick={copyLink}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 text-sm font-medium text-[var(--mt-text-2)] transition-colors hover:border-[var(--mt-border)] hover:bg-[var(--mt-elevated)]"
                  >
                    <Copy size={14} />
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    onClick={openAccessLink}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 text-sm font-medium text-[var(--mt-text-2)] transition-colors hover:border-[var(--mt-border)] hover:bg-[var(--mt-elevated)]"
                  >
                    <ExternalLink size={14} />
                    Probar acceso
                  </button>
                </div>
                <p className="text-xs text-[var(--mt-muted)]">
                  {result.channel === 'whatsapp'
                    ? 'El mensaje incluye este link directo y un PIN de respaldo para el paciente.'
                    : 'El paciente entra con este link sin escribir ID ni PIN.'}
                </p>
                {result.pin && (
                  <p className="text-xs font-medium text-[var(--mt-success)]">PIN enviado: {result.pin}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ClinicalPanel>
  )
}

function toNumberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function calculateBmi(record?: VitalSignsRecord | null) {
  const weight = Number(record?.weight_kg)
  const height = Number(record?.height_cm)
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null
  const meters = height / 100
  return Number((weight / (meters * meters)).toFixed(1))
}

function formatVitalDate(value: string) {
  return new Date(value).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLocalDateTimeInput(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}


function PatientBiometricsSection({
  token,
  patientId,
  encounters,
  records,
  preferredEncounterId,
  onSaved,
}: {
  token: string
  patientId: string
  encounters: Encounter[]
  records: VitalSignsRecord[]
  preferredEncounterId?: string
  onSaved: (record: VitalSignsRecord) => void
}) {
  const latest = records[0]
  const bmi = calculateBmi(latest)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const [form, setForm] = useState<Record<string, string>>({
    encounter_id: preferredEncounterId ?? '',
    blood_pressure_systolic: '',
    blood_pressure_diastolic: '',
    heart_rate: '',
    respiratory_rate: '',
    temperature_celsius: '',
    weight_kg: '',
    height_cm: '',
    oxygen_saturation: '',
    glucose_mg_dl: '',
    recorded_at: formatLocalDateTimeInput(),
  })

  useEffect(() => {
    if (!preferredEncounterId) return
    setForm(current => current.encounter_id ? current : { ...current, encounter_id: preferredEncounterId })
  }, [preferredEncounterId])

  function setField(field: string, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSavedNotice('')
    try {
      const hasAnyMeasurement = [
        form.blood_pressure_systolic,
        form.blood_pressure_diastolic,
        form.heart_rate,
        form.respiratory_rate,
        form.temperature_celsius,
        form.weight_kg,
        form.height_cm,
        form.oxygen_saturation,
        form.glucose_mg_dl,
      ].some(value => value.trim().length > 0)
      if (!hasAnyMeasurement) {
        setError('Ingresa al menos un dato antes de guardar.')
        return
      }
      const payload: VitalSignsInput = {
        encounter_id: form.encounter_id || undefined,
        blood_pressure_systolic: toNumberOrUndefined(form.blood_pressure_systolic),
        blood_pressure_diastolic: toNumberOrUndefined(form.blood_pressure_diastolic),
        heart_rate: toNumberOrUndefined(form.heart_rate),
        respiratory_rate: toNumberOrUndefined(form.respiratory_rate),
        temperature_celsius: toNumberOrUndefined(form.temperature_celsius),
        weight_kg: toNumberOrUndefined(form.weight_kg),
        height_cm: toNumberOrUndefined(form.height_cm),
        oxygen_saturation: toNumberOrUndefined(form.oxygen_saturation),
        glucose_mg_dl: toNumberOrUndefined(form.glucose_mg_dl),
        recorded_at: form.recorded_at ? new Date(form.recorded_at).toISOString() : undefined,
      }
      const saved = await createPatientVitalSigns(token, patientId, payload)
      onSaved(saved)
      setSavedNotice('Biometría guardada y asociada a la atención.')
      setForm(current => ({
        ...current,
        blood_pressure_systolic: '',
        blood_pressure_diastolic: '',
        heart_rate: '',
        respiratory_rate: '',
        temperature_celsius: '',
        weight_kg: '',
        height_cm: '',
        oxygen_saturation: '',
        glucose_mg_dl: '',
        recorded_at: formatLocalDateTimeInput(),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la biometría clínica')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <ClinicalPanel title="Perfil biométrico reciente" icon={Activity} accent="blue" collapsible defaultOpen={false}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MTStatBox
              label="Presión arterial"
              icon={Activity}
              value={latest?.blood_pressure_systolic && latest.blood_pressure_diastolic
                ? `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`
                : 'Sin dato'}
              helper="mmHg"
            />
            <MTStatBox
              label="Peso / IMC"
              icon={Scale}
              value={latest?.weight_kg ? `${latest.weight_kg} kg` : 'Sin dato'}
              helper={bmi ? `IMC ${bmi} kg/m²` : 'IMC calculado con peso y talla'}
            />
            <MTStatBox
              label="Talla"
              icon={Ruler}
              value={latest?.height_cm ? `${latest.height_cm} cm` : 'Sin dato'}
              helper="Dato longitudinal"
            />
            <MTStatBox
              label="Glucosa capilar"
              icon={FlaskConical}
              value={latest?.glucose_mg_dl ? `${latest.glucose_mg_dl}` : 'Sin dato'}
              helper="mg/dL"
            />
            <MTStatBox
              label="Frecuencia cardíaca"
              icon={Activity}
              value={latest?.heart_rate ? `${latest.heart_rate}` : 'Sin dato'}
              helper="lpm"
            />
            <MTStatBox
              label="Frecuencia respiratoria"
              icon={Activity}
              value={latest?.respiratory_rate ? `${latest.respiratory_rate}` : 'Sin dato'}
              helper="rpm"
            />
            <MTStatBox
              label="Temperatura"
              icon={Activity}
              value={latest?.temperature_celsius ? `${latest.temperature_celsius} °C` : 'Sin dato'}
            />
            <MTStatBox
              label="SpO₂"
              icon={Activity}
              value={latest?.oxygen_saturation ? `${latest.oxygen_saturation}%` : 'Sin dato'}
              helper="Pulsioximetría"
            />
          </div>
        </ClinicalPanel>

        <ClinicalPanel title="Historial de observaciones" icon={ClipboardList} accent="sky" collapsible defaultOpen={false}>
          {records.length === 0 ? (
            <EmptyClinicalState
              icon={Activity}
              title="Sin biometría registrada"
              description="Los datos opcionales del paciente aparecerán aquí y alimentarán el contexto de IA."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] text-xs uppercase tracking-wide text-[var(--mt-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">PA</th>
                    <th className="px-4 py-3 font-medium">FC/FR</th>
                    <th className="px-4 py-3 font-medium">Peso / Talla</th>
                    <th className="px-4 py-3 font-medium">IMC</th>
                    <th className="px-4 py-3 font-medium">SpO₂</th>
                    <th className="px-4 py-3 font-medium">Glucosa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.slice(0, 12).map(record => (
                    <tr key={record.id} className="text-[var(--mt-text-2)]">
                      <td className="px-4 py-3 text-xs text-[var(--mt-muted)]">{formatVitalDate(record.recorded_at)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {record.blood_pressure_systolic && record.blood_pressure_diastolic
                          ? `${record.blood_pressure_systolic}/${record.blood_pressure_diastolic}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {[record.heart_rate ? `${record.heart_rate} lpm` : null, record.respiratory_rate ? `${record.respiratory_rate} rpm` : null].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {[record.weight_kg ? `${record.weight_kg} kg` : null, record.height_cm ? `${record.height_cm} cm` : null].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{calculateBmi(record) ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{record.oxygen_saturation ? `${record.oxygen_saturation}%` : '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{record.glucose_mg_dl ? `${record.glucose_mg_dl} mg/dL` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ClinicalPanel>
      </div>

      <ClinicalPanel title="Registrar datos físicos y signos" icon={Plus} accent="green" collapsible defaultOpen={false}>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4 p-4">
          <div className="rounded-lg border border-[var(--mt-primary-mist)] bg-[var(--mt-primary-subtle)] px-3 py-3 text-sm leading-6 text-[var(--mt-primary-deep)]">
            <p className="font-semibold">Nueva observación biométrica</p>
            <p className="mt-1 text-xs leading-5 text-[var(--mt-primary)]">
              Guarda solo los datos disponibles. No reemplaza mediciones previas y puede quedar asociada a la consulta activa.
            </p>
          </div>
          <section className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--mt-muted)]">Contexto</p>
            <div className="grid gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Consulta asociada</label>
                <select value={form.encounter_id} onChange={e => setField('encounter_id', e.target.value)} className={fieldClass}>
                  <option value="">Sin consulta específica</option>
                  {encounters.slice(0, 12).map(encounter => (
                    <option key={encounter.id} value={encounter.id}>
                      {ENC_LABELS[encounter.encounter_type]} · {encounter.status === 'OPEN' ? 'Abierta · ' : ''}{new Date(encounter.opened_at).toLocaleDateString('es-GT')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Fecha/hora</label>
                <input type="datetime-local" value={form.recorded_at} onChange={e => setField('recorded_at', e.target.value)} className={fieldClass} />
              </div>
            </div>
          </section>
          <section className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--mt-muted)]">Presión arterial</p>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Sistólica</label>
              <input value={form.blood_pressure_systolic} onChange={e => setField('blood_pressure_systolic', e.target.value)} inputMode="numeric" placeholder="120" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Diastólica</label>
              <input value={form.blood_pressure_diastolic} onChange={e => setField('blood_pressure_diastolic', e.target.value)} inputMode="numeric" placeholder="80" className={fieldClass} />
            </div>
            </div>
          </section>
          <section className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--mt-muted)]">Medidas corporales</p>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Peso kg</label>
              <input value={form.weight_kg} onChange={e => setField('weight_kg', e.target.value)} inputMode="decimal" placeholder="72.5" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Talla cm</label>
              <input value={form.height_cm} onChange={e => setField('height_cm', e.target.value)} inputMode="decimal" placeholder="170" className={fieldClass} />
            </div>
            </div>
          </section>
          <section className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--mt-muted)]">Signos y glucosa</p>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>FC lpm</label>
              <input value={form.heart_rate} onChange={e => setField('heart_rate', e.target.value)} inputMode="numeric" placeholder="72" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>FR rpm</label>
              <input value={form.respiratory_rate} onChange={e => setField('respiratory_rate', e.target.value)} inputMode="numeric" placeholder="16" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Temperatura °C</label>
              <input value={form.temperature_celsius} onChange={e => setField('temperature_celsius', e.target.value)} inputMode="decimal" placeholder="36.7" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>SpO₂ %</label>
              <input value={form.oxygen_saturation} onChange={e => setField('oxygen_saturation', e.target.value)} inputMode="numeric" placeholder="98" className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Glucosa mg/dL</label>
              <input value={form.glucose_mg_dl} onChange={e => setField('glucose_mg_dl', e.target.value)} inputMode="numeric" placeholder="95" className={fieldClass} />
            </div>
            </div>
          </section>
          {error && <p className="text-xs text-[var(--mt-danger)]">{error}</p>}
          {savedNotice && <p className="rounded-lg bg-[var(--mt-success-subtle)] px-3 py-2 text-xs font-medium text-[var(--mt-success)]">{savedNotice}</p>}
          <button type="submit" disabled={saving} className={`${submitBtnClass} min-w-0`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar biometría
          </button>
        </form>
      </ClinicalPanel>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type PatientTab = 'summary' | 'historia' | 'biometrics' | 'encounters' | 'treatments' | 'adherence' | 'documents' | 'lab' | 'referrals' | 'admissions' | 'access' | 'compliance'

const TABS: Array<{ id: PatientTab; label: string; icon: typeof FileText }> = [
  { id: 'summary',      label: 'Resumen',        icon: Activity      },
  { id: 'historia',     label: 'Historia',        icon: BookOpen      },
  { id: 'biometrics',   label: 'Biometría',       icon: Scale         },
  { id: 'encounters',   label: 'Consultas',       icon: Stethoscope   },
  { id: 'treatments',   label: 'Tratamientos',    icon: Pill          },
  { id: 'adherence',    label: 'Adherencia',      icon: CalendarClock },
  { id: 'documents',    label: 'Documentos',      icon: FileText      },
  { id: 'lab',          label: 'Laboratorio',     icon: FlaskConical  },
  { id: 'referrals',    label: 'Referencias',      icon: ArrowUpDown   },
  { id: 'admissions',   label: 'Internamiento',   icon: BedDouble     },
  { id: 'access',       label: 'Portal',          icon: Link2         },
  { id: 'compliance',   label: 'Cumplimiento',    icon: ShieldCheck   },
]

const WORKFLOW_STAGE_LABELS: Record<PatientClinicalWorkspace['workflow']['stage'], string> = {
  INTAKE: 'Entrada',
  ROOMING: 'Triage',
  SUBJECTIVE: 'Historia actual',
  OBJECTIVE: 'Objetivo',
  ASSESSMENT: 'Evaluación',
  PLAN: 'Plan',
  ORDERS: 'Órdenes',
  READY_TO_CLOSE: 'Listo para cierre',
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { token, user } = useAuth()
  const patientId = params.id as string
  const isNewPatientFlow = searchParams.get('flow') === 'new'
  const canViewSensitive = hasPermission(user?.role, PERMISSIONS.PATIENT_SENSITIVE_READ, user?.permissions)

  function dismissNewPatientFlow() {
    if (!isNewPatientFlow) return
    router.replace(`/patients/${patientId}`)
  }

  // Clinical data
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [treatments, setTreatments] = useState<TreatmentPlan[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [adherence, setAdherence] = useState<PatientAdherenceReport | null>(null)
  const [checkIns, setCheckIns] = useState<PatientCheckIn[]>([])
  const [consents, setConsents] = useState<PatientConsent[]>([])
  const [labOrders, setLabOrders] = useState<LabOrder[]>([])
  const [problems, setProblems] = useState<PatientProblem[]>([])
  const [background, setBackground] = useState<PatientBackground[]>([])
  const [backgroundHistory, setBackgroundHistory] = useState<PatientBackground[]>([])
  const [vitalSigns, setVitalSigns] = useState<VitalSignsRecord[]>([])
  const [clinicalWorkspace, setClinicalWorkspace] = useState<PatientClinicalWorkspace | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [admissions, setAdmissions] = useState<Admission[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<PatientTab>('summary')

  // Encounter form
  const [showNewEnc, setShowNewEnc] = useState(false)
  const [encType, setEncType] = useState('CONSULTATION')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [encNotes, setEncNotes] = useState('')
  const [creatingEnc, setCreatingEnc] = useState(false)
  const [encError, setEncError] = useState('')

  // Problem form
  const [showNewProblem, setShowNewProblem] = useState(false)
  const [newProblemTitle, setNewProblemTitle] = useState('')
  const [newProblemStatus, setNewProblemStatus] = useState<ProblemStatus>('ACTIVE')
  const [newProblemIcd10, setNewProblemIcd10] = useState('')
  const [creatingProblem, setCreatingProblem] = useState(false)
  const [problemError, setProblemError] = useState('')

  // Background inline editing
  const [expandedBgCategories, setExpandedBgCategories] = useState<Set<BackgroundCategory>>(new Set())
  const [editingCategory, setEditingCategory] = useState<BackgroundCategory | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingBg, setSavingBg] = useState(false)
  const [retiringBg, setRetiringBg] = useState<BackgroundCategory | null>(null)
  const [showBackgroundHistory, setShowBackgroundHistory] = useState(false)
  const [bgError, setBgError] = useState('')

  // Compliance form
  const [showConsentForm, setShowConsentForm] = useState(false)
  const [consentType, setConsentType] = useState<ConsentType>('data_processing')
  const [consentDesc, setConsentDesc] = useState('')
  const [consentNotes, setConsentNotes] = useState('')
  const [consentedAt, setConsentedAt] = useState(new Date().toISOString().substring(0, 10))
  const [savingConsent, setSavingConsent] = useState(false)
  const [consentError, setConsentError] = useState('')
  const [exportingData, setExportingData] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)
  const [anonymizeConfirm, setAnonymizeConfirm] = useState(false)
  const [ageReferenceTime] = useState(() => Date.now())

  // Documents
  const [showUploader, setShowUploader] = useState(false)

  // Admission form
  const [showNewAdmission, setShowNewAdmission] = useState(false)
  const [admDepartmentId, setAdmDepartmentId] = useState('')
  const [admBedCode, setAdmBedCode] = useState('')
  const [admNotes, setAdmNotes] = useState('')
  const [admReferralId, setAdmReferralId] = useState('')
  const [admDischargeNotes, setAdmDischargeNotes] = useState('')
  const [dischargingId, setDischargingId] = useState<string | null>(null)
  const [creatingAdm, setCreatingAdm] = useState(false)
  const [admError, setAdmError] = useState('')
  const [focusAdmissions, setFocusAdmissions] = useState(false)

  // Referral form
  const [showNewReferral, setShowNewReferral] = useState(false)
  const [refToDoctorId, setRefToDoctorId] = useState('')
  const [refReason, setRefReason] = useState('')
  const [refNotes, setRefNotes] = useState('')
  const [refPriority, setRefPriority] = useState<ReferralPriority>('ROUTINE')
  const [creatingRef, setCreatingRef] = useState(false)
  const [refError, setRefError] = useState('')

  // FHIR export
  const [exportingFhir, setExportingFhir] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoadingPage(true)
    setLoadError(null)
    try {
      const [p, encs, plans, docs, adh, checks, cons, orders, probs, bg, bgHistory, vitals, workspace, refs, staffList, adms, depts] = await Promise.all([
        getPatient(token, patientId),
        listEncounters(token, patientId).catch(() => []),
        listPatientTreatments(token, patientId).catch(() => []),
        listDocuments(token, patientId).catch(() => []),
        getPatientAdherence(token, patientId, 30).catch(() => null),
        listPatientCheckIns(token, patientId, 14).catch(() => []),
        getPatientConsents(token, patientId).catch(() => []),
        listLabOrders(token, patientId).catch(() => []),
        listPatientProblems(token, patientId).catch(() => []),
        listPatientBackground(token, patientId).catch(() => []),
        listPatientBackgroundHistory(token, patientId).catch(() => []),
        listPatientVitalSigns(token, patientId).catch(() => []),
        getPatientClinicalWorkspace(token, patientId).catch(() => null),
        listPatientReferrals(token, patientId).catch(() => []),
        listStaff(token).then(r => r.staff).catch(() => []),
        listPatientAdmissions(token, patientId).catch(() => []),
        listDepartments(token).catch(() => []),
      ])
      setPatient(p)
      setEncounters(encs)
      setTreatments(plans)
      setDocuments(docs as Document[])
      setAdherence(adh)
      setCheckIns(checks)
      setConsents(cons)
      setLabOrders(orders)
      setProblems(probs)
      setBackground(bg)
      setBackgroundHistory(bgHistory)
      setVitalSigns(vitals)
      setClinicalWorkspace(workspace)
      setReferrals(refs)
      setStaff(staffList)
      setAdmissions(adms)
      setDepartments(depts)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
    } finally {
      setLoadingPage(false)
    }
  }, [token, patientId])

  useEffect(() => {
    void Promise.resolve().then(() => load())
  }, [load])

  useEffect(() => {
    if (activeTab !== 'admissions' || !focusAdmissions) return
    const id = window.setTimeout(() => {
      document.getElementById('patient-admissions-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setFocusAdmissions(false)
    }, 50)
    return () => window.clearTimeout(id)
  }, [activeTab, focusAdmissions])

  // Handle deep-link URL params: ?openTab=admissions&referralId=xxx
  useEffect(() => {
    const openTab = searchParams.get('openTab') as PatientTab | null
    const referralId = searchParams.get('referralId')
    if (!openTab || loadingPage) return
    if (openTab) setActiveTab(openTab)
    if (referralId) {
      setAdmReferralId(referralId)
      setShowNewAdmission(true)
    }
  }, [searchParams, loadingPage])

  function handleVitalSaved(record: VitalSignsRecord) {
    setVitalSigns(current => [record, ...current].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()))
    setClinicalWorkspace(current => {
      if (!current) return current
      const readiness = {
        ...current.readiness,
        has_vitals: true,
        has_objective: true,
        latest_encounter_vital_id: record.id,
      }
      return {
        ...current,
        workflow: {
          ...current.workflow,
          ready_to_close: Boolean(
            readiness.has_active_encounter &&
            readiness.has_subjective &&
            readiness.has_objective &&
            readiness.has_assessment &&
            readiness.has_plan,
          ),
        },
        readiness,
        context: {
          ...current.context,
          latest_vitals: [record, ...current.context.latest_vitals]
            .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
            .slice(0, 5),
        },
        next_actions: current.next_actions.filter(action => action.key !== 'RECORD_VITALS'),
      }
    })
  }

  function openAdmissionsSection(options?: { referralId?: string; dischargeId?: string }) {
    if (options?.referralId) setAdmReferralId(options.referralId)
    if (options?.dischargeId) setDischargingId(options.dischargeId)
    if (!options?.dischargeId) setShowNewAdmission(true)
    setAdmError('')
    setActiveTab('admissions')
    setFocusAdmissions(true)
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleCreateEncounter(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setCreatingEnc(true)
    setEncError('')
    try {
      const enc = await createEncounter(token, patientId, {
        encounter_type: encType as Encounter['encounter_type'],
        chief_complaint: chiefComplaint || undefined,
        notes: encNotes || undefined,
        workflow_stage: chiefComplaint.trim() ? 'SUBJECTIVE' : 'INTAKE',
      })
      router.push(`/patients/${patientId}/encounters/${enc.id}`)
    } catch (err) {
      setEncError(err instanceof Error ? err.message : 'Error al crear la consulta')
    } finally {
      setCreatingEnc(false)
    }
  }

  async function handleCreateProblem(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !newProblemTitle.trim()) return
    setCreatingProblem(true)
    setProblemError('')
    try {
      const p = await createPatientProblem(token, patientId, {
        title: newProblemTitle.trim(),
        status: newProblemStatus,
        icd10_code: newProblemIcd10.trim() || undefined,
      })
      setProblems(prev => [...prev, p].sort((a, b) => a.problem_number - b.problem_number))
      setShowNewProblem(false)
      setNewProblemTitle('')
      setNewProblemIcd10('')
      setNewProblemStatus('ACTIVE')
    } catch (err) {
      setProblemError(err instanceof Error ? err.message : 'Error al agregar el problema')
    } finally {
      setCreatingProblem(false)
    }
  }

  function startEditBg(category: BackgroundCategory) {
    const existing = background.find(b => b.category === category)
    setEditContent(existing?.content ?? '')
    setEditingCategory(category)
    setBgError('')
  }

  function startBackgroundCapture() {
    const firstEmpty = BG_CATEGORY_ORDER.find(category => !background.some(item => item.category === category && item.content.trim()))
    startEditBg(firstEmpty ?? 'ALERGIAS')
  }

  async function handleSaveBackground() {
    if (!token || !editingCategory) return
    const content = editContent.trim()
    if (!content) {
      setBgError('Escribe al menos un dato clínico para guardar este antecedente.')
      return
    }
    setSavingBg(true)
    setBgError('')
    try {
      const saved = await upsertPatientBackground(token, patientId, {
        category: editingCategory,
        content,
      })
      setBackground(prev => {
        const filtered = prev.filter(b => b.category !== editingCategory)
        return [...filtered, saved]
      })
      setClinicalWorkspace(current => current ? {
        ...current,
        readiness: {
          ...current.readiness,
          missing_core_background: current.readiness.missing_core_background.filter(category => category !== editingCategory),
        },
        context: {
          ...current.context,
          background: [
            ...current.context.background.filter(item => item.category !== editingCategory),
            saved,
          ],
        },
        next_actions: current.readiness.missing_core_background.filter(category => category !== editingCategory).length === 0
          ? current.next_actions.filter(action => action.key !== 'COMPLETE_CORE_BACKGROUND')
          : current.next_actions,
      } : current)
      const history = await listPatientBackgroundHistory(token, patientId).catch(() => null)
      if (history) setBackgroundHistory(history)
      setEditingCategory(null)
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingBg(false)
    }
  }

  async function handleRetireBackground(category: BackgroundCategory) {
    if (!token) return
    const cfg = BG_LABELS[category]
    const confirmed = window.confirm(`Retirar "${cfg.label}" del historial activo? Se conservará en el historial de cambios.`)
    if (!confirmed) return

    setRetiringBg(category)
    setBgError('')
    try {
      const retired = await retirePatientBackground(token, patientId, category)
      setBackground(prev => prev.filter(item => item.category !== category))
      setBackgroundHistory(prev => [retired, ...prev.filter(item => item.id !== retired.id)])
      if (editingCategory === category) setEditingCategory(null)
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Error al retirar antecedente')
    } finally {
      setRetiringBg(null)
    }
  }

  async function handleRecordConsent(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setSavingConsent(true)
    setConsentError('')
    try {
      const c = await recordConsent(token, patientId, {
        consent_type: consentType,
        description: consentDesc || undefined,
        consented_at: new Date(consentedAt).toISOString(),
        notes: consentNotes || undefined,
      })
      setConsents(prev => [c, ...prev])
      setShowConsentForm(false)
      setConsentDesc('')
      setConsentNotes('')
    } catch (err) {
      setConsentError(err instanceof Error ? err.message : 'Error al registrar consentimiento')
    } finally {
      setSavingConsent(false)
    }
  }

  async function handleWithdrawConsent(consentId: string) {
    if (!token) return
    await withdrawConsent(token, patientId, consentId)
    setConsents(prev => prev.map(c => c.id === consentId ? { ...c, withdrawn_at: new Date().toISOString() } : c))
  }

  async function handleExportData() {
    if (!token) return
    setExportingData(true)
    try {
      const data = await exportPatientData(token, patientId)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `patient-export-${patientId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingData(false)
    }
  }

  async function handleAnonymize() {
    if (!token) return
    setAnonymizing(true)
    try {
      await anonymizePatient(token, patientId)
      setAnonymizeConfirm(false)
      await load()
    } finally {
      setAnonymizing(false)
    }
  }

  async function handleAdmitPatient(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setCreatingAdm(true)
    setAdmError('')
    try {
      const adm = await admitPatient(token, patientId, {
        department_id: admDepartmentId || undefined,
        referral_id: admReferralId || undefined,
        bed_code: admBedCode.trim() || undefined,
        admission_notes: admNotes.trim() || undefined,
      })
      setAdmissions(prev => [adm, ...prev])
      setShowNewAdmission(false)
      setAdmDepartmentId('')
      setAdmBedCode('')
      setAdmNotes('')
      setAdmReferralId('')
    } catch (err) {
      setAdmError(err instanceof Error ? err.message : 'Error al internar al paciente')
    } finally {
      setCreatingAdm(false)
    }
  }

  async function handleDischargePatient(admissionId: string) {
    if (!token) return
    setDischargingId(admissionId)
    setAdmError('')
    try {
      const updated = await dischargePatient(token, admissionId, {
        discharge_notes: admDischargeNotes.trim() || undefined,
      })
      setAdmissions(prev => prev.map(a => a.id === admissionId ? { ...a, ...updated } : a))
      setAdmDischargeNotes('')
    } catch (err) {
      setAdmError(err instanceof Error ? err.message : 'Error al dar de alta')
    } finally {
      setDischargingId(null)
    }
  }

  async function handleCreateReferral(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !refToDoctorId || !refReason.trim()) return
    setCreatingRef(true)
    setRefError('')
    try {
      const ref = await createReferral(token, patientId, {
        to_doctor_id: refToDoctorId,
        reason: refReason.trim(),
        notes: refNotes.trim() || undefined,
        priority: refPriority,
      })
      setReferrals(prev => [ref, ...prev])
      setShowNewReferral(false)
      setRefToDoctorId('')
      setRefReason('')
      setRefNotes('')
      setRefPriority('ROUTINE')
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Error al crear referencia')
    } finally {
      setCreatingRef(false)
    }
  }

  async function handleExportFhir() {
    if (!token) return
    setExportingFhir(true)
    try {
      const bundle = await getPatientFhirBundle(token, patientId)
      const json = JSON.stringify(bundle, null, 2)
      const blob = new Blob([json], { type: 'application/fhir+json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fhir-patient-${patientId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingFhir(false)
    }
  }

  function handleUploaded(doc: Document) {
    setDocuments(prev => [doc, ...prev])
    setShowUploader(false)
  }

  // ─── Loading / empty states ──────────────────────────────────────────────────

  if (loadingPage) {
    return (
      <ClinicalPage>
        <LoadingState label="Cargando expediente clínico..." />
      </ClinicalPage>
    )
  }

  if (loadError) {
    return (
      <ClinicalPage>
        <ClinicalInsight tone="red" title="Error al cargar el expediente">
          {loadError} — Verifica que el servidor backend esté corriendo en el puerto 3001.
        </ClinicalInsight>
        <div style={{ marginTop: 8 }}>
          <ClinicalButton icon={ArrowLeft} href="/patients" variant="outline" tone="slate">
            Volver a pacientes
          </ClinicalButton>
        </div>
      </ClinicalPage>
    )
  }

  if (!patient) return null

  // ─── Derived data ────────────────────────────────────────────────────────────

  function calcAge(dob: string | null) {
    if (!dob) return null
    return Math.floor((ageReferenceTime - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
  }

  const age = calcAge(patient.date_of_birth)
  const activeAdmission = admissions.find(a => a.status === 'ACTIVE') ?? null
  const canCreateAdmission = !activeAdmission
  const activeTreatments = treatments.filter(t => t.status === 'ACTIVE')
  const draftTreatments = treatments.filter(t => t.status === 'DRAFT')
  const adherenceTone: Tone = adherence && adherence.overall_score >= 80
    ? 'green'
    : adherence && adherence.overall_score >= 50
      ? 'amber'
      : 'red'
  const latestCheckIn = checkIns[0]
  const latestCheckInTone: Tone = latestCheckIn?.severity === 'ALERT'
    ? 'red'
    : latestCheckIn?.severity === 'WATCH'
      ? 'amber'
      : 'green'
  const alertCheckIns = checkIns.filter(c => c.severity === 'ALERT').length
  const activeProblems = problems.filter(p => p.status === 'ACTIVE' || p.status === 'CHRONIC')

  const timelineItemsWithSort = [
    ...encounters.map(enc => ({
      id: enc.id,
      title: ENC_LABELS[enc.encounter_type] ?? enc.encounter_type,
      subtitle: enc.chief_complaint ?? enc.summary ?? undefined,
      sortAt: enc.opened_at,
      date: new Date(enc.opened_at).toLocaleDateString('es', { day: 'numeric', month: 'short' }),
      tone: enc.status === 'OPEN' ? 'green' as const : 'blue' as const,
      href: `/patients/${patientId}/encounters/${enc.id}`,
    })),
    ...documents.slice(0, 4).map(doc => ({
      id: doc.id,
      title: `Documento: ${doc.file_name}`,
      subtitle: doc.is_visible_to_patient ? 'Visible para paciente' : 'Solo equipo clínico',
      sortAt: doc.created_at,
      date: new Date(doc.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' }),
      tone: 'slate' as const,
      href: undefined,
    })),
  ]

  const timelineItems: TimelineItem[] = timelineItemsWithSort
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
    .slice(0, 6)
    .map(item => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      date: item.date,
      tone: item.tone,
      href: item.href,
    }))

  const consentTypeLabel: Record<string, string> = {
    data_processing:   'Tratamiento de datos',
    treatment:         'Tratamiento médico',
    third_party_sharing: 'Compartir con terceros',
    research:          'Investigación',
    marketing:         'Marketing',
  }
  const workspaceStage = clinicalWorkspace?.workflow.stage ?? 'INTAKE'
  const activeWorkspaceEncounter = clinicalWorkspace?.active_encounter ?? null
  const showNewPatientHandoff = isNewPatientFlow && !activeWorkspaceEncounter
  const latestWorkspaceVitals = clinicalWorkspace?.context.latest_vitals?.[0] ?? vitalSigns[0] ?? null
  const hasVitalsForEncounter = Boolean(clinicalWorkspace?.readiness.has_vitals)
  const hasAnyVitals = Boolean(latestWorkspaceVitals)
  const blockingWorkspaceActions = clinicalWorkspace?.next_actions.filter(action => action.priority !== 'LOW') ?? []
  const actionableWorkspaceActions = blockingWorkspaceActions.filter(action => !(action.key === 'RECORD_VITALS' && hasAnyVitals))
  const visibleWorkspaceActions = actionableWorkspaceActions.slice(0, 3)
  const workspaceReadinessCards: Array<{
    key: string
    label: string
    status: string
    helper: string
    tone: Tone
    icon: typeof Stethoscope
  }> = [
    {
      key: 'encounter',
      label: 'Consulta actual',
      status: activeWorkspaceEncounter ? 'Abierta' : 'Sin abrir',
      helper: activeWorkspaceEncounter
        ? `${ENC_LABELS[activeWorkspaceEncounter.encounter_type]} en curso`
        : 'Inicia una consulta para documentar la atención.',
      tone: activeWorkspaceEncounter ? 'green' : 'amber',
      icon: Stethoscope,
    },
    {
      key: 'history',
      label: 'Historia del motivo',
      status: clinicalWorkspace?.readiness.has_subjective ? 'Completa' : 'Pendiente',
      helper: clinicalWorkspace?.readiness.has_subjective
        ? 'Ya hay motivo, historia o notas iniciales.'
        : 'Falta registrar qué refiere el paciente.',
      tone: clinicalWorkspace?.readiness.has_subjective ? 'green' : 'amber',
      icon: BookOpen,
    },
    {
      key: 'vitals',
      label: 'Signos de esta atención',
      status: hasVitalsForEncounter ? 'Registrados' : hasAnyVitals ? 'Previos disponibles' : 'Pendientes',
      helper: hasVitalsForEncounter
        ? 'Hay signos asociados o recientes para la consulta activa.'
        : hasAnyVitals
          ? `Última biometría: ${formatVitalDate(latestWorkspaceVitals!.recorded_at)}. Registra o asocia signos si serán usados para cerrar esta consulta.`
          : 'Falta registrar PA, FC, FR, temperatura, peso/talla u otros datos disponibles.',
      tone: hasVitalsForEncounter ? 'green' : hasAnyVitals ? 'amber' : 'slate',
      icon: Scale,
    },
    {
      key: 'assessment',
      label: 'Evaluación médica',
      status: clinicalWorkspace?.readiness.has_assessment ? 'Lista' : 'Pendiente',
      helper: clinicalWorkspace?.readiness.has_assessment
        ? 'Ya hay impresión diagnóstica registrada.'
        : 'Falta documentar impresión clínica o diferenciales.',
      tone: clinicalWorkspace?.readiness.has_assessment ? 'green' : 'amber',
      icon: ClipboardList,
    },
    {
      key: 'plan',
      label: 'Plan de manejo',
      status: clinicalWorkspace?.readiness.has_plan ? 'Definido' : 'Pendiente',
      helper: clinicalWorkspace?.readiness.has_plan
        ? 'Hay plan, resumen o tratamiento asociado.'
        : 'Falta indicar tratamiento, seguimiento u órdenes.',
      tone: clinicalWorkspace?.readiness.has_plan ? 'green' : 'amber',
      icon: Pill,
    },
  ]

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <ClinicalPage>
      {/* ── Header ── */}
      <ClinicalHeader
        eyebrow="Expediente clínico"
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={patient.notes ?? 'Fuente de mando clínico: consultas, historia, adherencia y acceso al portal.'}
        icon={UserRound}
        meta={
          <>
            {patient.mrn && <span className="font-mono font-semibold text-[var(--mt-primary-deep)]">{patient.mrn}</span>}
            {age !== null && <span>{age} años</span>}
            {patient.sex && <span>{{ male: 'Masculino', female: 'Femenino', other: 'Otro' }[patient.sex]}</span>}
            {patient.id_number && <span>CI: {patient.id_number}</span>}
            {patient.email && <span>{patient.email}</span>}
            {patient.phone && <span>{patient.phone}</span>}
          </>
        }
        actions={
          <>
            <ClinicalButton href="/patients" icon={ArrowLeft} variant="outline" tone="slate">
              Pacientes
            </ClinicalButton>
            {canViewSensitive && (
              <ClinicalButton
                icon={exportingFhir ? Loader2 : Download}
                onClick={handleExportFhir}
                disabled={exportingFhir}
                variant="outline"
                tone="blue"
              >
                FHIR
              </ClinicalButton>
            )}
          </>
        }
      />

      {patient._access_notice && (
        <ClinicalInsight
          tone="amber"
          title="Acceso limitado"
        >
          {patient._access_notice}
        </ClinicalInsight>
      )}

      {/* ── Metric chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }} className="sm:grid-cols-4">
        <MTStatChip icon={Stethoscope} label="Consultas" value={encounters.length} tone="blue" />
        <MTStatChip
          icon={Pill} label="Tratamientos" value={activeTreatments.length}
          helper={draftTreatments.length > 0 ? `${draftTreatments.length} borrador(es)` : `${treatments.length} totales`}
          tone={activeTreatments.length > 0 ? 'green' : 'slate'}
        />
        <MTStatChip
          icon={CalendarClock} label="Adherencia"
          value={adherence && adherence.total > 0 ? `${adherence.overall_score}%` : '—'}
          helper={adherence && adherence.total > 0 ? `${adherence.confirmed}/${adherence.total} dosis` : 'Sin datos'}
          tone={adherence && adherence.total > 0 ? adherenceTone : 'slate'}
        />
        <MTStatChip
          icon={Activity} label="Seguimiento"
          value={checkIns.length > 0 ? `${checkIns.length}` : '—'}
          helper={alertCheckIns > 0 ? `${alertCheckIns} alerta(s)` : latestCheckIn ? 'Último reporte' : 'Sin check-ins'}
          tone={latestCheckIn ? latestCheckInTone : 'slate'}
        />
      </div>

      {/* ── Active admission banner ── */}
      {activeAdmission && (
        <div className="rounded-xl border border-[var(--mt-primary-mist)] bg-[var(--mt-primary-subtle)] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--mt-primary)] flex items-center justify-center shrink-0">
              <BedDouble size={17} color="#fff" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--mt-primary-deep)]">Paciente internado</span>
                {activeAdmission.bed_code && (
                  <span className="font-mono text-xs bg-[var(--mt-primary-subtle)] text-[var(--mt-primary)] px-2 py-0.5 rounded">
                    {activeAdmission.bed_code}
                  </span>
                )}
                {activeAdmission.department && (
                  <span className="text-xs text-[var(--mt-primary)]">{activeAdmission.department.name}</span>
                )}
                <span className="text-xs text-[var(--mt-primary)]">
                  · {Math.ceil((Date.now() - new Date(activeAdmission.admitted_at).getTime()) / 86_400_000)} día(s)
                </span>
              </div>
              <p className="text-xs text-[var(--mt-primary)] mt-0.5">
                Desde {new Date(activeAdmission.admitted_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                {activeAdmission.referral ? ' · Por referencia' : ''}
              </p>
            </div>
          </div>
          <ClinicalButton
            icon={LogOut}
            variant="outline"
            tone="blue"
            onClick={() => openAdmissionsSection({ dischargeId: activeAdmission.id })}
          >
            Gestionar alta
          </ClinicalButton>
        </div>
      )}

      {showNewPatientHandoff && (
        <section className="rounded-lg border border-[var(--mt-primary-mist)] bg-[var(--mt-primary-subtle)] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--mt-primary-deep)]">Paciente creado. Elige cómo iniciar la atención.</p>
              <p className="mt-1 text-sm leading-6 text-[var(--mt-primary)]">
                Puedes abrir consulta de una vez, tomar signos primero o completar antecedentes antes de pasar con el doctor.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[620px] lg:grid-cols-4">
              <ClinicalButton
                icon={Stethoscope}
                onClick={() => { dismissNewPatientFlow(); setActiveTab('encounters'); setShowNewEnc(true) }}
              >
                Iniciar consulta
              </ClinicalButton>
              <ClinicalButton
                icon={Scale}
                variant="outline"
                tone="blue"
                onClick={() => { dismissNewPatientFlow(); setActiveTab('biometrics') }}
              >
                Tomar signos
              </ClinicalButton>
              <ClinicalButton
                icon={BookOpen}
                variant="outline"
                tone="blue"
                onClick={() => { dismissNewPatientFlow(); setActiveTab('historia'); startBackgroundCapture() }}
              >
                Completar historia
              </ClinicalButton>
              <ClinicalButton
                icon={X}
                variant="ghost"
                tone="slate"
                onClick={dismissNewPatientFlow}
              >
                Después
              </ClinicalButton>
            </div>
          </div>
        </section>
      )}

      {/* ── Clinical workflow ── */}
      <section className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 items-center gap-2 rounded-md bg-[var(--mt-primary-subtle)] px-3 text-sm font-semibold text-[var(--mt-primary)]">
                  <Stethoscope size={15} />
                  Estado de esta atención
                </span>
                <span
                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
                  style={clinicalWorkspace?.workflow.ready_to_close
                    ? { background: 'var(--mt-success-subtle)', color: 'var(--mt-success)' }
                    : { background: '#FEF3C7', color: '#B45309' }}
                >
                  {clinicalWorkspace?.workflow.ready_to_close
                    ? 'Lista para cierre'
                    : `${actionableWorkspaceActions.length} pendiente(s)`}
                </span>
                <span className="inline-flex h-8 items-center rounded-md border border-[var(--mt-border)] bg-[var(--mt-elevated)] px-3 text-xs font-medium text-[var(--mt-muted)]">
                  Etapa: {WORKFLOW_STAGE_LABELS[workspaceStage]}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--mt-text-2)]">
                Este resumen evalúa la consulta activa. La biometría del perfil puede estar completa, pero “signos de esta atención” solo queda listo cuando esos datos están asociados o son recientes para esta consulta.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {activeWorkspaceEncounter ? (
              <ClinicalButton
                href={`/patients/${patientId}/encounters/${activeWorkspaceEncounter.id}`}
                icon={Stethoscope}
                tone="blue"
              >
                Abrir consulta
              </ClinicalButton>
            ) : (
              <ClinicalButton
                icon={Plus}
                tone="blue"
                onClick={() => { setActiveTab('encounters'); setShowNewEnc(true) }}
              >
                Iniciar
              </ClinicalButton>
            )}
            <ClinicalButton
              icon={Scale}
              variant="outline"
              tone={hasVitalsForEncounter ? 'green' : 'amber'}
              onClick={() => setActiveTab('biometrics')}
            >
              {hasVitalsForEncounter ? 'Ver signos' : 'Registrar signos'}
            </ClinicalButton>
            <ClinicalButton
              icon={BookOpen}
              variant="outline"
              tone="slate"
              onClick={() => setActiveTab('historia')}
            >
              Historia
            </ClinicalButton>
            <ClinicalButton
              href={`/clinical-intelligence?patientId=${patientId}`}
              icon={Activity}
              variant="outline"
              tone="slate"
            >
              Copiloto
            </ClinicalButton>
            {canCreateAdmission && (
              <ClinicalButton
                icon={BedDouble}
                variant="outline"
                tone="slate"
                onClick={() => openAdmissionsSection()}
              >
                Internar
              </ClinicalButton>
            )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {workspaceReadinessCards.map(item => {
              const Icon = item.icon
              const cardStyle = item.tone === 'green'
                ? { border: '1px solid var(--mt-border)', background: 'var(--mt-success-subtle)', color: 'var(--mt-success)' }
                : item.tone === 'amber'
                  ? { border: '1px solid #FDE68A', background: '#FEF3C7', color: '#92400E' }
                  : { border: '1px solid var(--mt-border)', background: 'var(--mt-elevated)', color: 'var(--mt-text-2)' }
              const iconStyle = item.tone === 'green'
                ? { background: 'var(--mt-success-subtle)', color: 'var(--mt-success)' }
                : item.tone === 'amber'
                  ? { background: '#FDE68A', color: '#B45309' }
                  : { background: 'var(--mt-elevated)', color: 'var(--mt-muted)' }
              return (
                <details key={item.key} className="group overflow-hidden rounded-lg" style={cardStyle}>
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={iconStyle}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-0.5 text-xs font-semibold opacity-80">{item.status}</p>
                    </div>
                    <ChevronDown size={15} className="mt-1 shrink-0 opacity-70 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-white/60 px-3 pb-3 pt-2">
                    <p className="text-xs leading-5 opacity-80">{item.helper}</p>
                  </div>
                </details>
              )
            })}
          </div>

          {visibleWorkspaceActions.length > 0 && (
            <details className="group overflow-hidden rounded-lg border border-[var(--mt-primary-mist)] bg-[var(--mt-primary-subtle)]">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[var(--mt-primary-deep)]">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--mt-primary)]">Siguientes pasos sugeridos</p>
                  <p className="mt-0.5 text-xs text-[var(--mt-primary)]">{visibleWorkspaceActions.length} pendiente(s) priorizado(s)</p>
                </div>
                <ChevronDown size={15} className="shrink-0 text-[var(--mt-primary)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-2 border-t border-[var(--mt-primary-mist)] px-4 pb-4 pt-2 md:grid-cols-2">
                {visibleWorkspaceActions.map(action => (
                  <p key={action.key} className="text-sm leading-6 text-[var(--mt-primary-deep)]">
                    {action.label}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>


      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-[var(--mt-border)] bg-[var(--mt-surface)]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'admissions') {
                    openAdmissionsSection()
                    return
                  }
                  setActiveTab(tab.id)
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                  selected ? 'bg-[var(--mt-primary-subtle)] text-[var(--mt-primary)]' : 'text-[var(--mt-muted)] hover:bg-[var(--mt-elevated)] hover:text-[var(--mt-text)]'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SUMMARY                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ClinicalPanel title="Timeline clínico reciente" icon={CalendarClock} collapsible defaultOpen={false}>
            {timelineItems.length > 0 ? (
              <ClinicalTimeline items={timelineItems} />
            ) : (
              <EmptyClinicalState
                icon={CalendarClock}
                title="Sin actividad clínica reciente"
                description="Cuando registres consultas o documentos, aparecerán aquí."
              />
            )}
          </ClinicalPanel>

          <div className="flex flex-col gap-4">
            <ClinicalPanel title="Seguimiento diario" icon={Activity} collapsible defaultOpen={false}>
              <div className="flex flex-col gap-3 p-4">
                {latestCheckIn ? (
                  <>
                    <ClinicalInsight tone={latestCheckInTone} title={`Último check-in: ${new Date(latestCheckIn.check_in_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}>
                      Dolor {latestCheckIn.pain_score ?? '—'}/10
                      {latestCheckIn.temperature_c ? `, temperatura ${latestCheckIn.temperature_c}°C` : ''}
                      {latestCheckIn.symptoms.length > 0 ? `, síntomas: ${latestCheckIn.symptoms.join(', ')}` : ''}
                    </ClinicalInsight>
                    {latestCheckIn.red_flags.length > 0 && (
                      <ClinicalInsight tone="red" title="Señales de alarma">
                        {latestCheckIn.red_flags.join(', ')}
                      </ClinicalInsight>
                    )}
                    {latestCheckIn.notes && (
                      <p className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-elevated)] px-3 py-2 text-sm text-[var(--mt-text-2)]">
                        {latestCheckIn.notes}
                      </p>
                    )}
                  </>
                ) : (
                  <EmptyClinicalState
                    icon={Activity}
                    title="Sin check-in diario"
                    description="Cuando el paciente reporte cómo se siente, aparecerá aquí."
                  />
                )}
              </div>
            </ClinicalPanel>

            <ClinicalPanel title="Resumen de expediente" icon={ClipboardList} collapsible defaultOpen={false}>
              <div className="flex flex-col gap-3 p-4">
                <ClinicalInsight tone={activeTreatments.length > 0 ? 'green' : 'blue'} title="Tratamientos">
                  {activeTreatments.length > 0
                    ? `${activeTreatments.length} tratamiento(s) activo(s) en seguimiento.`
                    : 'No hay tratamientos activos.'}
                </ClinicalInsight>
                {activeProblems.length > 0 && (
                  <ClinicalInsight tone="amber" title="Problemas activos">
                    {activeProblems.slice(0, 3).map(p => `#${p.problem_number} ${p.title}`).join(' · ')}
                    {activeProblems.length > 3 ? ` y ${activeProblems.length - 3} más` : ''}
                  </ClinicalInsight>
                )}
                {adherence && adherence.total > 0 && (
                  <ClinicalInsight tone={adherenceTone} title="Adherencia">
                    {adherence.overall_score}% en los últimos 30 días, con {adherence.missed} dosis perdidas.
                  </ClinicalInsight>
                )}
                <ClinicalButton
                  icon={Plus}
                  onClick={() => {
                    setActiveTab('encounters')
                    setShowNewEnc(true)
                  }}
                >
                  Nueva consulta
                </ClinicalButton>
              </div>
            </ClinicalPanel>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: HISTORIA CLÍNICA (POMR)                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'historia' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── Lista de problemas (Weed) ── */}
          <ClinicalPanel
            title="Lista de problemas"
            icon={ClipboardList}
            accent="red"
            collapsible
            defaultOpen={false}
            actions={
              <button
                onClick={() => { setShowNewProblem(v => !v); setProblemError('') }}
                className={panelToggleClass}
              >
                {showNewProblem ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Agregar</>}
              </button>
            }
          >
            {showNewProblem && (
              <form onSubmit={handleCreateProblem} className="flex flex-col gap-3 border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className={labelClass}>Título del problema <span className="text-[var(--mt-danger)]">*</span></label>
                    <input
                      value={newProblemTitle}
                      onChange={e => setNewProblemTitle(e.target.value)}
                      placeholder="Ej: Hipertensión arterial esencial"
                      required
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Estado</label>
                    <select
                      value={newProblemStatus}
                      onChange={e => setNewProblemStatus(e.target.value as ProblemStatus)}
                      className={fieldClass}
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="CHRONIC">Crónico</option>
                      <option value="INACTIVE">Inactivo</option>
                      <option value="RESOLVED">Resuelto</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Código ICD-10 (opcional)</label>
                    <input
                      value={newProblemIcd10}
                      onChange={e => setNewProblemIcd10(e.target.value)}
                      placeholder="Ej: I10"
                      className={fieldClass}
                    />
                  </div>
                </div>
                {problemError && <p className="text-xs text-[var(--mt-danger)]">{problemError}</p>}
                <button type="submit" disabled={creatingProblem || !newProblemTitle.trim()} className={submitBtnClass}>
                  {creatingProblem ? <Loader2 size={14} className="animate-spin" /> : null}
                  Agregar problema
                </button>
              </form>
            )}

            {problems.length === 0 && !showNewProblem ? (
              <EmptyClinicalState
                icon={ClipboardList}
                title="Lista de problemas vacía"
                description="Registra los problemas de salud del paciente según el método de Weed."
                action={
                  <ClinicalButton icon={Plus} onClick={() => setShowNewProblem(true)}>
                    Agregar primer problema
                  </ClinicalButton>
                }
              />
            ) : (
              <div className="divide-y divide-[var(--mt-border)]">
                {problems.map(p => {
                  const cfg = PROBLEM_STATUS[p.status]
                  return (
                    <div key={p.id} className="flex items-start gap-4 px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mt-elevated)] text-xs font-bold text-[var(--mt-text-2)]">
                        #{p.problem_number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-[var(--mt-text)]">{p.title}</p>
                          <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--mt-muted)]">
                          {p.icd10_code && <span>ICD-10: {p.icd10_code}{p.icd10_description ? ` · ${p.icd10_description}` : ''}</span>}
                          {p.onset_date && <span>Desde: {new Date(p.onset_date).toLocaleDateString('es')}</span>}
                          {p.resolved_date && <span>Resuelto: {new Date(p.resolved_date).toLocaleDateString('es')}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ClinicalPanel>

          {/* ── Antecedentes ── */}
          <ClinicalPanel
            title="Antecedentes"
            icon={BookOpen}
            accent="purple"
            collapsible
            defaultOpen={false}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowBackgroundHistory(value => !value)}
                  className={panelToggleClass}
                >
                  <ClipboardList size={15} /> {showBackgroundHistory ? 'Ocultar historial' : 'Ver historial'}
                </button>
                <button
                  onClick={startBackgroundCapture}
                  className={panelToggleClass}
                >
                  <Plus size={15} /> Agregar antecedente
                </button>
              </div>
            }
          >
            <div className="divide-y divide-[var(--mt-border)]">
              {BG_CATEGORY_ORDER.map(category => {
                const cfg = BG_LABELS[category]
                const record = background.find(b => b.category === category)
                const isEditing = editingCategory === category
                const isExpanded = expandedBgCategories.has(category) || isEditing

                function toggleCategory() {
                  setExpandedBgCategories(prev => {
                    const next = new Set(prev)
                    next.has(category) ? next.delete(category) : next.add(category)
                    return next
                  })
                }

                return (
                  <div key={category}>
                    <button
                      type="button"
                      onClick={toggleCategory}
                      className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left hover:bg-[var(--mt-elevated)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <StatusPill tone={cfg.tone}>{category}</StatusPill>
                        <span className="text-xs font-medium text-[var(--mt-text-2)]">{cfg.label}</span>
                        {record?.content && !isExpanded && (
                          <span className="text-xs text-[var(--mt-muted)] italic truncate max-w-[140px]">
                            {record.content.slice(0, 40)}{record.content.length > 40 ? '…' : ''}
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        size={14}
                        className="shrink-0 text-[var(--mt-muted)] transition-transform"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                      />
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4">
                        {!isEditing && (
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditBg(category) }}
                              className="inline-flex items-center gap-1 text-xs text-[var(--mt-muted)] hover:text-[var(--mt-primary)] transition-colors"
                            >
                              {record?.content ? <Pencil size={12} /> : <Plus size={12} />}
                              {record?.content ? 'Editar' : 'Agregar'}
                            </button>
                            {record?.content && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRetireBackground(category) }}
                                disabled={retiringBg === category}
                                className="inline-flex items-center gap-1 text-xs text-[var(--mt-muted)] hover:text-[var(--mt-danger)] disabled:opacity-60 transition-colors"
                              >
                                {retiringBg === category ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                Retirar
                              </button>
                            )}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              rows={4}
                              placeholder={BG_HELP_TEXT[category]}
                              className="w-full resize-none rounded-lg border border-[var(--mt-primary-mist)] bg-[var(--mt-surface)] px-3 py-2 text-sm text-[var(--mt-text)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-primary-mist)]"
                            />
                            <p className="text-xs leading-relaxed text-[var(--mt-muted)]">{BG_HELP_TEXT[category]}</p>
                            {bgError && <p className="text-xs text-[var(--mt-danger)]">{bgError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveBackground}
                                disabled={savingBg || !editContent.trim()}
                                className="flex items-center gap-1.5 rounded-lg bg-[var(--mt-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--mt-primary-deep)] disabled:opacity-60 transition-colors"
                              >
                                {savingBg ? <Loader2 size={11} className="animate-spin" /> : null}
                                Guardar
                              </button>
                              <button
                                onClick={() => { setEditingCategory(null) }}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--mt-muted)] hover:bg-[var(--mt-elevated)] transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : record?.content ? (
                          <p className="text-sm text-[var(--mt-text-2)] leading-relaxed">{record.content}</p>
                        ) : (
                          <p className="text-xs italic text-[var(--mt-border)]">Sin registro — toca Agregar para documentar.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ClinicalPanel>
        </div>
      )}

      {showBackgroundHistory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-3 py-4 backdrop-blur-sm sm:items-center" style={{ background: 'rgba(2,6,23,.35)' }}>
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--mt-border)] bg-[var(--mt-surface)] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--mt-border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: '#F3E8FF', color: '#9333EA' }}>
                  <ClipboardList size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--mt-text)]">Historial de antecedentes</p>
                  <p className="text-xs text-[var(--mt-muted)]">{backgroundHistory.length} cambios registrados</p>
                </div>
              </div>
              <button
                onClick={() => setShowBackgroundHistory(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mt-muted)] transition-colors hover:bg-[var(--mt-elevated)] hover:text-[var(--mt-text-2)]"
                aria-label="Cerrar historial"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--mt-elevated)] p-4">
              {backgroundHistory.length === 0 ? (
                <p className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] p-4 text-sm text-[var(--mt-muted)]">Sin cambios registrados todavía.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {backgroundHistory.map(item => {
                    const cfg = BG_LABELS[item.category]
                    return (
                      <div key={item.id} className="rounded-lg border border-[var(--mt-border)] bg-[var(--mt-surface)] px-3 py-2.5 shadow-sm">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <StatusPill tone={cfg.tone}>{item.category}</StatusPill>
                          <span className="text-xs font-medium text-[var(--mt-text-2)]">{cfg.label}</span>
                          <span className={item.is_current ? 'rounded-full bg-[var(--mt-success-subtle)] px-2 py-0.5 text-xs text-[var(--mt-success)]' : 'rounded-full bg-[var(--mt-elevated)] px-2 py-0.5 text-xs text-[var(--mt-muted)]'}>
                            {item.is_current ? 'Vigente' : 'Retirado'}
                          </span>
                          <span className="ml-auto text-xs text-[var(--mt-muted)]">{formatVitalDate(item.recorded_at ?? item.created_at)}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--mt-text-2)]">{item.content}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: BIOMETRÍA                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'biometrics' && token && (
        <PatientBiometricsSection
          token={token}
          patientId={patientId}
          encounters={encounters}
          records={vitalSigns}
          preferredEncounterId={activeWorkspaceEncounter?.id}
          onSaved={handleVitalSaved}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ENCOUNTERS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'encounters' && (
        <ClinicalPanel
          title={`Consultas${encounters.length > 0 ? ` (${encounters.length})` : ''}`}
          icon={Stethoscope}
          collapsible
          defaultOpen={false}
          actions={
            <button
              onClick={() => { setShowNewEnc(v => !v); setEncError('') }}
              className={panelToggleClass}
            >
              {showNewEnc ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Nueva consulta</>}
            </button>
          }
        >
          {showNewEnc && (
            <form onSubmit={handleCreateEncounter} className="flex flex-col gap-3 border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Tipo de consulta</label>
                <select
                  value={encType}
                  onChange={e => setEncType(e.target.value)}
                  className={fieldClass}
                >
                  {ENC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Motivo de consulta</label>
                <input
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="Dolor de cabeza, control de hipertensión..."
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Notas iniciales</label>
                <textarea
                  value={encNotes}
                  onChange={e => setEncNotes(e.target.value)}
                  rows={2}
                  className={`${fieldClass} resize-none`}
                />
              </div>
              {encError && <p className="text-xs text-[var(--mt-danger)]">{encError}</p>}
              <button type="submit" disabled={creatingEnc} className={submitBtnClass}>
                {creatingEnc ? <Loader2 size={14} className="animate-spin" /> : null}
                Abrir consulta
              </button>
            </form>
          )}

          <div className="divide-y divide-[var(--mt-border)]">
            {encounters.length === 0 && !showNewEnc && (
              <EmptyClinicalState
                icon={Stethoscope}
                title="Sin consultas registradas"
                description="Abre la primera consulta para iniciar el expediente clínico."
                action={
                  <ClinicalButton icon={Plus} onClick={() => setShowNewEnc(true)}>
                    Nueva consulta
                  </ClinicalButton>
                }
              />
            )}
            {encounters.map(enc => (
              <Link
                key={enc.id}
                href={`/patients/${patientId}/encounters/${enc.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--mt-elevated)] transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[var(--mt-text)]">
                      {ENC_LABELS[enc.encounter_type] ?? enc.encounter_type}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: ENC_STATUS_COLORS[enc.status]?.bg ?? 'var(--mt-elevated)', color: ENC_STATUS_COLORS[enc.status]?.color ?? 'var(--mt-muted)' }}>
                      {enc.status === 'OPEN' ? 'Abierta' : enc.status === 'CLOSED' ? 'Cerrada' : enc.status}
                    </span>
                  </div>
                  {enc.chief_complaint && (
                    <p className="text-xs text-[var(--mt-muted)] truncate">{enc.chief_complaint}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-[var(--mt-muted)]">
                    {new Date(enc.opened_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <ExternalLink size={14} className="text-[var(--mt-border)] group-hover:text-[var(--mt-muted)] transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TREATMENTS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'treatments' && (
        <ClinicalPanel title="Tratamientos del paciente" icon={Pill} collapsible defaultOpen={false}>
          {treatments.length > 0 ? (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {treatments.map(t => <TreatmentCard key={t.id} treatment={t} />)}
            </div>
          ) : (
            <EmptyClinicalState
              icon={Pill}
              title="Sin tratamientos registrados"
              description="Crea una consulta y agrega un plan de tratamiento para iniciar seguimiento."
              action={
                <ClinicalButton
                  icon={Plus}
                  onClick={() => { setActiveTab('encounters'); setShowNewEnc(true) }}
                >
                  Nueva consulta
                </ClinicalButton>
              }
            />
          )}
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ADHERENCE                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'adherence' && (
        adherence && adherence.total > 0 ? (
          <ClinicalPanel
            title="Adherencia — últimos 30 días"
            icon={CalendarClock}
            accent={adherenceTone}
            collapsible
            defaultOpen={false}
            actions={<StatusPill tone={adherenceTone}>{adherence.overall_score}%</StatusPill>}
          >
            <div className="p-5">
              <AdherenceCalendar
                days={adherence.days}
                streak={adherence.streak}
                overallScore={adherence.overall_score}
              />
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--mt-muted)]">
                <span>Confirmadas: <strong className="text-[var(--mt-text-2)]">{adherence.confirmed}</strong></span>
                <span>Perdidas: <strong className="text-[var(--mt-text-2)]">{adherence.missed}</strong></span>
                <span>Total: <strong className="text-[var(--mt-text-2)]">{adherence.total}</strong></span>
              </div>
              {adherence.overall_score < 70 && (
                <div className="mt-4">
                  <ClinicalInsight tone="amber" title="Atención de seguimiento">
                    La adherencia del periodo está por debajo del umbral recomendado. Considera revisar barreras, horarios o canal de recordatorio con el paciente.
                  </ClinicalInsight>
                </div>
              )}
            </div>
          </ClinicalPanel>
        ) : (
          <EmptyClinicalState
            icon={CalendarClock}
            title="Sin datos de adherencia"
            description="La adherencia aparecerá cuando existan dosis programadas y confirmaciones del paciente."
          />
        )
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: DOCUMENTS                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <ClinicalPanel
          title={`Documentos${documents.length > 0 ? ` (${documents.length})` : ''}`}
          icon={FileText}
          accent="slate"
          collapsible
          defaultOpen={false}
          actions={
            <button
              onClick={() => setShowUploader(v => !v)}
              className={panelToggleClass}
            >
              {showUploader ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Subir</>}
            </button>
          }
        >
          {showUploader && token && (
            <div className="border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
              <DocumentUploader token={token} patientId={patientId} onUploaded={handleUploaded} />
            </div>
          )}
          <div className="px-5 py-4">
            {documents.length === 0 && !showUploader ? (
              <EmptyClinicalState
                icon={FileText}
                title="Sin documentos"
                description="Sube resultados, imágenes o cualquier documento clínico del paciente."
                action={
                  <ClinicalButton icon={Plus} onClick={() => setShowUploader(true)}>
                    Subir documento
                  </ClinicalButton>
                }
              />
            ) : token && (
              <DocumentList
                token={token}
                documents={documents}
                onDeleted={id => setDocuments(prev => prev.filter(d => d.id !== id))}
                onVisibilityChanged={(id, visible) =>
                  setDocuments(prev => prev.map(d => d.id === id ? { ...d, is_visible_to_patient: visible } : d))
                }
              />
            )}
          </div>
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: LAB                                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lab' && (
        <ClinicalPanel
          title={`Órdenes de laboratorio${labOrders.length > 0 ? ` (${labOrders.length})` : ''}`}
          icon={FlaskConical}
          accent="sky"
          collapsible
          defaultOpen={false}
          actions={
            <Link href={`/lab/new?patient=${patientId}`} className={panelToggleClass}>
              <Plus size={15} /> Nueva orden
            </Link>
          }
        >
          {labOrders.length === 0 ? (
            <EmptyClinicalState
              icon={FlaskConical}
              title="Sin órdenes de laboratorio"
              description="Crea la primera orden para registrar resultados y hacer seguimiento."
              action={
                <ClinicalButton icon={Plus} href={`/lab/new?patient=${patientId}`}>
                  Crear primera orden
                </ClinicalButton>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--mt-border)]">
              {labOrders.map(order => {
                const cfg = ORDER_STATUS_CONFIG[order.status]
                const critical = order.results.filter(r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW').length
                const abnormal = order.results.filter(r => r.status === 'HIGH' || r.status === 'LOW').length
                return (
                  <Link
                    key={order.id}
                    href={`/lab/${order.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--mt-elevated)] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-[var(--mt-text)]">
                          {new Date(order.ordered_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: cfg.color, background: cfg.bg }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--mt-muted)]">{order.results.length} parámetro{order.results.length !== 1 ? 's' : ''}</span>
                        {critical > 0 && <span className="font-bold text-[var(--mt-danger)]">{critical} crítico{critical > 1 ? 's' : ''}</span>}
                        {critical === 0 && abnormal > 0 && <span className="font-semibold" style={{ color: '#D97706' }}>{abnormal} fuera de rango</span>}
                        {critical === 0 && abnormal === 0 && order.results.length > 0 && order.results.every(r => r.status === 'NORMAL') && (
                          <span className="text-[var(--mt-success)]">Todos normales</span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-[var(--mt-border)] group-hover:text-[var(--mt-muted)] transition-colors shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: REFERRALS                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'referrals' && (
        <ClinicalPanel
          title={`Referencias${referrals.length > 0 ? ` (${referrals.length})` : ''}`}
          icon={ArrowUpDown}
          accent="blue"
          collapsible
          defaultOpen={false}
          actions={
            <button
              onClick={() => { setShowNewReferral(v => !v); setRefError('') }}
              className={panelToggleClass}
            >
              {showNewReferral ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Nueva</>}
            </button>
          }
        >
          {showNewReferral && (
            <form onSubmit={handleCreateReferral} className="flex flex-col gap-3 border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className={labelClass}>Médico receptor <span className="text-[var(--mt-danger)]">*</span></label>
                  <select
                    value={refToDoctorId}
                    onChange={e => setRefToDoctorId(e.target.value)}
                    required
                    className={fieldClass}
                  >
                    <option value="">Seleccionar médico…</option>
                    {staff.filter(s => s.role === 'DOCTOR' || s.role === 'ADMIN_CLINIC').map(s => (
                      <option key={s.id} value={s.id}>
                        Dr. {s.first_name} {s.last_name}{s.specialty ? ` — ${s.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Prioridad</label>
                  <select
                    value={refPriority}
                    onChange={e => setRefPriority(e.target.value as ReferralPriority)}
                    className={fieldClass}
                  >
                    <option value="ROUTINE">Rutina</option>
                    <option value="URGENT">Urgente</option>
                    <option value="EMERGENCY">Emergencia</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Motivo de referencia <span className="text-[var(--mt-danger)]">*</span></label>
                <textarea
                  value={refReason}
                  onChange={e => setRefReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Describe el motivo clínico de la referencia…"
                  className={`${fieldClass} resize-none`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Notas adicionales (opcional)</label>
                <textarea
                  value={refNotes}
                  onChange={e => setRefNotes(e.target.value)}
                  rows={2}
                  className={`${fieldClass} resize-none`}
                />
              </div>
              {refError && <p className="text-xs text-[var(--mt-danger)]">{refError}</p>}
              <button
                type="submit"
                disabled={creatingRef || !refToDoctorId || !refReason.trim()}
                className={submitBtnClass}
              >
                {creatingRef ? <Loader2 size={14} className="animate-spin" /> : null}
                Enviar referencia
              </button>
            </form>
          )}

          {referrals.length === 0 && !showNewReferral ? (
            <EmptyClinicalState
              icon={ArrowUpDown}
              title="Sin referencias"
              description="Las referencias enviadas y recibidas para este paciente aparecerán aquí."
            />
          ) : (
            <div className="divide-y divide-[var(--mt-border)]">
              {referrals.map(ref => {
                const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
                  PENDING:   { label: 'Pendiente',  tone: 'amber' },
                  ACCEPTED:  { label: 'Aceptada',   tone: 'blue'  },
                  REJECTED:  { label: 'Rechazada',  tone: 'red'   },
                  COMPLETED: { label: 'Completada', tone: 'green' },
                  CANCELLED: { label: 'Cancelada',  tone: 'slate' },
                }
                const PRIO_LABEL: Record<string, string> = {
                  ROUTINE: 'Rutina', URGENT: 'Urgente', EMERGENCY: 'Emergencia',
                }
                const PRIO_STYLE: Record<string, React.CSSProperties> = {
                  ROUTINE:   { background: 'var(--mt-elevated)', color: 'var(--mt-text-2)' },
                  URGENT:    { background: '#FDE68A', color: '#B45309' },
                  EMERGENCY: { background: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)' },
                }
                const cfg = STATUS_LABEL[ref.status] ?? { label: ref.status, tone: 'slate' as Tone }
                return (
                  <div key={ref.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {ref.from_doctor && (
                            <span className="inline-flex items-center gap-1 text-xs text-[var(--mt-muted)]">
                              <Send size={11} />
                              Dr. {ref.from_doctor.first_name} {ref.from_doctor.last_name}
                            </span>
                          )}
                          {ref.to_doctor && (
                            <span className="text-xs text-[var(--mt-muted)]">→ Dr. {ref.to_doctor.first_name} {ref.to_doctor.last_name}{ref.to_doctor.specialty ? ` (${ref.to_doctor.specialty})` : ''}</span>
                          )}
                          {ref.to_department && (
                            <span className="text-xs text-[var(--mt-muted)]">→ {ref.to_department.name}</span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--mt-text-2)] mt-1 leading-relaxed line-clamp-2">{ref.reason}</p>
                        {ref.response_notes && (
                          <p className="text-xs text-[var(--mt-muted)] italic border-l-2 border-[var(--mt-border)] pl-2 mt-1">{ref.response_notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={PRIO_STYLE[ref.priority] ?? PRIO_STYLE.ROUTINE}>
                          {PRIO_LABEL[ref.priority]}
                        </span>
                        <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[var(--mt-muted)]">
                        {new Date(ref.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {ref.responded_at && ` · Respondida: ${new Date(ref.responded_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}`}
                      </p>
                      {ref.status === 'ACCEPTED' && canCreateAdmission && (
                        <button
                          onClick={() => openAdmissionsSection({ referralId: ref.id })}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--mt-primary)] hover:text-[var(--mt-primary-deep)] transition-colors"
                        >
                          <BedDouble size={12} /> Internar desde referencia
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ADMISSIONS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'admissions' && (
        <div id="patient-admissions-section" className="scroll-mt-24">
          <ClinicalPanel
            title={`Internamientos${admissions.length > 0 ? ` (${admissions.length})` : ''}`}
            icon={BedDouble}
            accent="blue"
            actions={
              canCreateAdmission && admissions.length > 0 ? (
                <button
                  onClick={() => { setShowNewAdmission(v => !v); setAdmError('') }}
                  className={panelToggleClass}
                >
                  {showNewAdmission ? <><ChevronUp size={15} /> Ocultar formulario</> : <><Plus size={15} /> Nuevo internamiento</>}
                </button>
              ) : undefined
            }
          >
            {canCreateAdmission && !showNewAdmission && admissions.length > 0 && (
              <div className="border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowNewAdmission(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--mt-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--mt-primary-deep)]"
                >
                  <Plus size={14} />
                  Registrar nuevo internamiento
                </button>
              </div>
            )}
            {canCreateAdmission && (showNewAdmission || admissions.length === 0) && (
              <form onSubmit={handleAdmitPatient} className="flex flex-col gap-4 border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
                <div className="rounded-lg border border-[var(--mt-primary-mist)] bg-[var(--mt-surface)] px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--mt-text)]">Registrar internamiento</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--mt-text-2)]">
                    Usa esta sección cuando el paciente queda hospitalizado, en observación o asignado a una cama/sala. Solo puede existir un internamiento activo por paciente.
                  </p>
                </div>
                {/* Referral quick-link */}
                {referrals.filter(r => r.status === 'ACCEPTED').length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Referencia asociada (opcional)</label>
                    <select
                      value={admReferralId}
                      onChange={e => setAdmReferralId(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Sin referencia</option>
                      {referrals.filter(r => r.status === 'ACCEPTED').map(r => (
                        <option key={r.id} value={r.id}>
                          Referencia aceptada — {r.reason.slice(0, 60)}{r.reason.length > 60 ? '…' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Departamento (opcional)</label>
                    <select
                      value={admDepartmentId}
                      onChange={e => setAdmDepartmentId(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Sin asignar</option>
                      {departments.filter(d => d.is_active).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Cama / Sala (opcional)</label>
                    <input
                      value={admBedCode}
                      onChange={e => setAdmBedCode(e.target.value)}
                      placeholder="Ej: SALA-3-B2"
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Notas de ingreso (opcional)</label>
                  <textarea
                    value={admNotes}
                    onChange={e => setAdmNotes(e.target.value)}
                    rows={3}
                    placeholder="Motivo clínico del internamiento, condición al ingreso…"
                    className={`${fieldClass} resize-none`}
                  />
                </div>
                {admError && <p className="text-xs text-[var(--mt-danger)]">{admError}</p>}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-[var(--mt-muted)]">
                    Departamento y cama son opcionales; puedes asignarlos después si aún no están definidos.
                  </p>
                  <button type="submit" disabled={creatingAdm} className={submitBtnClass}>
                    {creatingAdm ? <Loader2 size={14} className="animate-spin" /> : <BedDouble size={14} />}
                    Confirmar internamiento
                  </button>
                </div>
              </form>
            )}

            {activeAdmission && (
              <div className="border-b border-[var(--mt-primary-mist)] bg-[var(--mt-primary-subtle)] px-5 py-3 text-sm leading-6 text-[var(--mt-primary-deep)]">
                Este paciente ya tiene un internamiento activo. Para registrar uno nuevo, primero confirma el alta del internamiento actual.
              </div>
            )}

            {admissions.length > 0 && (
              <div className="divide-y divide-[var(--mt-border)]">
                {admissions.map(adm => {
                  const isActive = adm.status === 'ACTIVE'
                  const days = Math.ceil((Date.now() - new Date(adm.admitted_at).getTime()) / 86_400_000)
                  return (
                    <div key={adm.id} className="px-5 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusPill tone={isActive ? 'blue' : 'slate'}>
                              {isActive ? 'Internado' : 'Alta'}
                            </StatusPill>
                            {adm.bed_code && (
                              <span className="font-mono text-xs bg-[var(--mt-elevated)] text-[var(--mt-text-2)] px-2 py-0.5 rounded">
                                {adm.bed_code}
                              </span>
                            )}
                            {adm.department && (
                              <span className="text-xs text-[var(--mt-muted)]">{adm.department.name}</span>
                            )}
                          </div>
                          {adm.admission_notes && (
                            <p className="text-sm text-[var(--mt-text-2)] leading-relaxed line-clamp-2">{adm.admission_notes}</p>
                          )}
                          {adm.discharge_notes && (
                            <p className="text-xs text-[var(--mt-muted)] italic border-l-2 border-[var(--mt-border)] pl-2">{adm.discharge_notes}</p>
                          )}
                          <p className="text-xs text-[var(--mt-muted)]">
                            Ingreso: {new Date(adm.admitted_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {isActive ? ` · ${days} día(s)` : ''}
                            {adm.discharged_at ? ` · Alta: ${new Date(adm.discharged_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                            {adm.admitted_by_doctor ? ` · Dr. ${adm.admitted_by_doctor.last_name}` : ''}
                            {adm.referral ? ` · Por referencia` : ''}
                          </p>
                        </div>
                        {isActive && (
                          <div className="shrink-0">
                            {dischargingId === adm.id ? (
                              <div className="flex flex-col gap-2 w-48">
                                <textarea
                                  value={admDischargeNotes}
                                  onChange={e => setAdmDischargeNotes(e.target.value)}
                                  rows={2}
                                  placeholder="Notas de alta (opcional)…"
                                  className={`${fieldClass} resize-none text-xs`}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDischargePatient(adm.id)}
                                    className="flex items-center gap-1 text-xs font-medium text-[var(--mt-success)] hover:text-[var(--mt-success)] transition-colors"
                                  >
                                    <CheckCircle size={13} /> Confirmar
                                  </button>
                                  <button
                                    onClick={() => { setDischargingId(null); setAdmDischargeNotes('') }}
                                    className="text-xs text-[var(--mt-muted)] hover:text-[var(--mt-text-2)] transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDischargingId(adm.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--mt-success)] transition-colors"
                              >
                                <LogOut size={13} /> Dar alta
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ClinicalPanel>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PORTAL ACCESS                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'access' && token && (
        <PortalAccessSection token={token} patientId={patientId} treatments={treatments} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: COMPLIANCE                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'compliance' && (
        <div className="flex flex-col gap-4">
          {/* Consents */}
          <ClinicalPanel
            title={`Consentimientos${consents.length > 0 ? ` (${consents.length})` : ''}`}
            icon={ShieldCheck}
            accent="green"
            collapsible
            defaultOpen={false}
            actions={
              <button
                onClick={() => setShowConsentForm(v => !v)}
                className={panelToggleClass}
              >
                {showConsentForm ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Registrar</>}
              </button>
            }
          >
            {showConsentForm && (
              <form onSubmit={handleRecordConsent} className="flex flex-col gap-3 border-b border-[var(--mt-border)] bg-[var(--mt-elevated)] px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Tipo</label>
                    <select
                      value={consentType}
                      onChange={e => setConsentType(e.target.value as ConsentType)}
                      className={fieldClass}
                    >
                      <option value="data_processing">Tratamiento de datos</option>
                      <option value="treatment">Tratamiento médico</option>
                      <option value="third_party_sharing">Compartir con terceros</option>
                      <option value="research">Investigación</option>
                      <option value="marketing">Marketing</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>Fecha de consentimiento</label>
                    <input
                      type="date"
                      value={consentedAt}
                      onChange={e => setConsentedAt(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Descripción (opcional)</label>
                  <input
                    value={consentDesc}
                    onChange={e => setConsentDesc(e.target.value)}
                    placeholder="Ej: Política de privacidad v2.1..."
                    className={fieldClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Notas internas</label>
                  <textarea
                    value={consentNotes}
                    onChange={e => setConsentNotes(e.target.value)}
                    rows={2}
                    className={`${fieldClass} resize-none`}
                  />
                </div>
                {consentError && <p className="text-xs text-[var(--mt-danger)]">{consentError}</p>}
                <button type="submit" disabled={savingConsent} className={submitBtnClass}>
                  {savingConsent ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar consentimiento
                </button>
              </form>
            )}

            <div className="divide-y divide-[var(--mt-border)]">
              {consents.length === 0 && !showConsentForm && (
                <EmptyClinicalState
                  icon={ShieldCheck}
                  title="Sin consentimientos registrados"
                  description="Registra los consentimientos informados del paciente para cumplimiento legal."
                />
              )}
              {consents.map(c => {
                const isActive = !c.withdrawn_at
                return (
                  <div key={c.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-[var(--mt-text)]">{consentTypeLabel[c.consent_type] ?? c.consent_type}</span>
                        <StatusPill tone={isActive ? 'green' : 'slate'}>{isActive ? 'Activo' : 'Retirado'}</StatusPill>
                      </div>
                      {c.description && <p className="text-xs text-[var(--mt-muted)] mb-0.5">{c.description}</p>}
                      <p className="text-xs text-[var(--mt-muted)]">
                        Consentido: {new Date(c.consented_at).toLocaleDateString('es')}
                        {c.recorded_by_email ? ` · Por: ${c.recorded_by_email}` : ''}
                        {c.withdrawn_at ? ` · Retirado: ${new Date(c.withdrawn_at).toLocaleDateString('es')}` : ''}
                      </p>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleWithdrawConsent(c.id)}
                        title="Retirar consentimiento"
                        className="text-[var(--mt-border)] hover:text-[var(--mt-danger)] transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </ClinicalPanel>

          {/* GDPR */}
          <ClinicalPanel title="RGPD / GDPR" icon={Download} accent="red" collapsible defaultOpen={false}>
            <div className="flex flex-col gap-6 px-5 py-5">
              <div>
                <p className="text-sm font-medium text-[var(--mt-text-2)] mb-1">Exportar datos del paciente</p>
                <p className="text-xs text-[var(--mt-muted)] mb-3">
                  Descarga un JSON con todos los datos del paciente para cumplir el derecho de portabilidad.
                </p>
                <ClinicalButton
                  icon={exportingData ? Loader2 : Download}
                  onClick={handleExportData}
                  disabled={exportingData}
                  variant="outline"
                  tone="blue"
                >
                  {exportingData ? 'Exportando...' : 'Descargar datos'}
                </ClinicalButton>
              </div>

              <hr className="border-[var(--mt-border)]" />

              <div>
                <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--mt-danger)]">
                  <AlertTriangle size={14} /> Anonimizar datos personales
                </p>
                <p className="text-xs text-[var(--mt-muted)] mb-3">
                  Elimina irreversiblemente nombre, fecha de nacimiento, teléfono, email y número de documento.
                  Los datos médicos se conservan por obligación legal. Esta acción no se puede deshacer.
                </p>
                {patient?.anonymized_at ? (
                  <p className="text-xs text-[var(--mt-muted)] bg-[var(--mt-elevated)] rounded-lg px-3 py-2">
                    Paciente anonimizado el {new Date(patient.anonymized_at as unknown as string).toLocaleDateString('es')}
                  </p>
                ) : !anonymizeConfirm ? (
                  <button
                    onClick={() => setAnonymizeConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--mt-danger-subtle)] text-[var(--mt-danger)] text-sm font-medium hover:bg-[var(--mt-danger-subtle)] transition-colors"
                  >
                    <Trash2 size={14} /> Anonimizar paciente
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-[var(--mt-danger)] font-medium">¿Confirmar? Esta acción es irreversible.</span>
                    <button
                      onClick={handleAnonymize}
                      disabled={anonymizing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--mt-danger)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
                    >
                      {anonymizing ? <Loader2 size={12} className="animate-spin" /> : null}
                      Sí, anonimizar
                    </button>
                    <button
                      onClick={() => setAnonymizeConfirm(false)}
                      className="text-xs text-[var(--mt-muted)] hover:text-[var(--mt-text)] transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </ClinicalPanel>
        </div>
      )}
    </ClinicalPage>
  )
}
