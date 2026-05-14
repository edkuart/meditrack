'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Plus, ChevronUp,
  QrCode, Link2, Loader2, ExternalLink, Download, MessageCircle,
  Activity, CalendarClock, ClipboardList, Pill, Stethoscope, UserRound,
  ShieldCheck, Trash2, AlertTriangle, Copy, FlaskConical, BookOpen, Pencil,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getPatient, listEncounters, createEncounter, listDocuments,
  generatePortalAccess, getPatientFhirBundle, listPatientTreatments,
  listPatientCheckIns, listPatientProblems, createPatientProblem,
  listPatientBackground, upsertPatientBackground,
  type Patient, type Encounter, type Document, type AccessResult,
  type TreatmentPlan, type PatientCheckIn,
  type PatientProblem, type PatientBackground, type BackgroundCategory, type ProblemStatus,
} from '@/lib/doctor/api'
import {
  getPatientConsents, recordConsent, withdrawConsent, exportPatientData, anonymizePatient,
  type PatientConsent, type ConsentType,
} from '@/lib/doctor/compliance-api'
import { listLabOrders, ORDER_STATUS_CONFIG, type LabOrder } from '@/lib/doctor/lab-api'
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

const ENC_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  OPEN: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-500',
  ARCHIVED: 'bg-slate-50 text-slate-400',
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
const fieldClass = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white w-full'
const labelClass = 'text-xs font-medium text-slate-500'
const submitBtnClass = 'w-full sm:w-auto sm:self-end flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-600 transition-colors'
const panelToggleClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors'

// ─── TreatmentCard ─────────────────────────────────────────────────────────────
function TreatmentCard({ treatment }: { treatment: TreatmentPlan }) {
  const status = TREATMENT_STATUS[treatment.status]
  return (
    <Link
      href={`/patients/${treatment.patient_id}/encounters/${treatment.encounter_id}`}
      className="block rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{treatment.name}</p>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="text-xs text-slate-400">
            Desde {new Date(treatment.start_date).toLocaleDateString('es')}
            {treatment.end_date ? ` hasta ${new Date(treatment.end_date).toLocaleDateString('es')}` : ''}
          </p>
        </div>
        <Pill size={18} className="shrink-0 text-blue-500" />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {treatment.medications.slice(0, 3).map(med => (
          <div key={med.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-700">{med.drug_name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {med.dose_amount} {med.dose_unit}
              {med.route ? ` · ${med.route}` : ''}
              {med.times_per_day && med.times_per_day.length > 0 ? ` · ${med.times_per_day.join(', ')}` : ''}
            </p>
          </div>
        ))}
        {treatment.medications.length > 3 && (
          <p className="text-xs text-slate-400">+{treatment.medications.length - 3} medicamentos más</p>
        )}
        {(treatment.interventions ?? []).slice(0, 2).map(iv => (
          <div key={iv.id} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
            <Activity size={12} className="shrink-0 text-emerald-600" />
            <p className="text-xs font-medium text-slate-700">{iv.title}</p>
            {iv.frequency && <p className="text-xs text-slate-400">· {iv.frequency}</p>}
          </div>
        ))}
        {(treatment.interventions ?? []).length > 2 && (
          <p className="text-xs text-slate-400">+{(treatment.interventions ?? []).length - 2} indicaciones más</p>
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
    <ClinicalPanel title="Acceso al portal del paciente" icon={Link2} accent="green">
      <div className="flex flex-col gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tratamientos activos</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{activeTreatments.length}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Estado del acceso</p>
            <p className="mt-1 text-sm text-slate-700">
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
            >
              {loading === channel ? <Loader2 size={14} className="animate-spin" /> : icon}
              {label}
            </button>
          ))}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="rounded-xl border border-green-100 bg-green-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-green-700">
                {result.channel === 'whatsapp' ? 'WhatsApp enviado al paciente' : 'Link directo listo para entregar'}
              </p>
              <p className="text-xs text-slate-500">
                Expira: {new Date(result.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              {qrDataUrl && (
                <div className="flex justify-center rounded-xl border border-green-100 bg-white p-3">
                  <img src={qrDataUrl} alt="QR de acceso directo al portal" className="h-48 w-48 rounded-lg" />
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-center gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={withFreshPortalSession(result.access_url)}
                    className="min-w-0 flex-1 rounded-lg border border-green-100 bg-white px-3 py-2 text-xs text-slate-700"
                  />
                  <button
                    onClick={copyLink}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-green-100 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50"
                  >
                    <Copy size={14} />
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    onClick={openAccessLink}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-green-100 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50"
                  >
                    <ExternalLink size={14} />
                    Probar acceso
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {result.channel === 'whatsapp'
                    ? 'El mensaje incluye este link directo y un PIN de respaldo para el paciente.'
                    : 'El paciente entra con este link sin escribir ID ni PIN.'}
                </p>
                {result.pin && (
                  <p className="text-xs font-medium text-green-700">PIN enviado: {result.pin}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ClinicalPanel>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type PatientTab = 'summary' | 'historia' | 'encounters' | 'treatments' | 'adherence' | 'documents' | 'lab' | 'access' | 'compliance'

const TABS: Array<{ id: PatientTab; label: string; icon: typeof FileText }> = [
  { id: 'summary',     label: 'Resumen',      icon: Activity      },
  { id: 'historia',    label: 'Historia',     icon: BookOpen      },
  { id: 'encounters',  label: 'Consultas',    icon: Stethoscope   },
  { id: 'treatments',  label: 'Tratamientos', icon: Pill          },
  { id: 'adherence',   label: 'Adherencia',   icon: CalendarClock },
  { id: 'documents',   label: 'Documentos',   icon: FileText      },
  { id: 'lab',         label: 'Laboratorio',  icon: FlaskConical  },
  { id: 'access',      label: 'Portal',       icon: Link2         },
  { id: 'compliance',  label: 'Cumplimiento', icon: ShieldCheck   },
]

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const patientId = params.id as string

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
  const [editingCategory, setEditingCategory] = useState<BackgroundCategory | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingBg, setSavingBg] = useState(false)
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

  // Documents
  const [showUploader, setShowUploader] = useState(false)

  // FHIR export
  const [exportingFhir, setExportingFhir] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoadingPage(true)
    setLoadError(null)
    try {
      const [p, encs, plans, docs, adh, checks, cons, orders, probs, bg] = await Promise.all([
        getPatient(token, patientId),
        listEncounters(token, patientId),
        listPatientTreatments(token, patientId).catch(() => []),
        listDocuments(token, patientId).catch(() => []),
        getPatientAdherence(token, patientId, 30).catch(() => null),
        listPatientCheckIns(token, patientId, 14).catch(() => []),
        getPatientConsents(token, patientId).catch(() => []),
        listLabOrders(token, patientId).catch(() => []),
        listPatientProblems(token, patientId).catch(() => []),
        listPatientBackground(token, patientId).catch(() => []),
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
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo conectar con el servidor')
    } finally {
      setLoadingPage(false)
    }
  }, [token, patientId])

  useEffect(() => { load() }, [load])

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

  async function handleSaveBackground() {
    if (!token || !editingCategory) return
    setSavingBg(true)
    setBgError('')
    try {
      const saved = await upsertPatientBackground(token, patientId, {
        category: editingCategory,
        content: editContent.trim(),
      })
      setBackground(prev => {
        const filtered = prev.filter(b => b.category !== editingCategory)
        return [...filtered, saved]
      })
      setEditingCategory(null)
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingBg(false)
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
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
  }

  const age = calcAge(patient.date_of_birth)
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

  const timelineItems: TimelineItem[] = [
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
    })),
  ]
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
    .slice(0, 6)
    .map(({ sortAt, ...item }) => item)

  const consentTypeLabel: Record<string, string> = {
    data_processing:   'Tratamiento de datos',
    treatment:         'Tratamiento médico',
    third_party_sharing: 'Compartir con terceros',
    research:          'Investigación',
    marketing:         'Marketing',
  }

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
            <ClinicalButton
              icon={exportingFhir ? Loader2 : Download}
              onClick={handleExportFhir}
              disabled={exportingFhir}
              variant="outline"
              tone="blue"
            >
              FHIR
            </ClinicalButton>
          </>
        }
      />

      {/* ── Metric chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }} className="sm:grid-cols-4">
        {[
          {
            icon: Stethoscope, label: 'Consultas',
            value: encounters.length, helper: undefined, tone: 'blue' as Tone,
          },
          {
            icon: Pill, label: 'Tratamientos',
            value: activeTreatments.length,
            helper: draftTreatments.length > 0 ? `${draftTreatments.length} borrador(es)` : `${treatments.length} totales`,
            tone: (activeTreatments.length > 0 ? 'green' : 'slate') as Tone,
          },
          {
            icon: CalendarClock, label: 'Adherencia',
            value: adherence && adherence.total > 0 ? `${adherence.overall_score}%` : '—',
            helper: adherence && adherence.total > 0 ? `${adherence.confirmed}/${adherence.total} dosis` : 'Sin datos',
            tone: (adherence && adherence.total > 0 ? adherenceTone : 'slate') as Tone,
          },
          {
            icon: Activity, label: 'Seguimiento',
            value: checkIns.length > 0 ? `${checkIns.length}` : '—',
            helper: alertCheckIns > 0 ? `${alertCheckIns} alerta(s)` : latestCheckIn ? 'Último reporte' : 'Sin check-ins',
            tone: (latestCheckIn ? latestCheckInTone : 'slate') as Tone,
          },
        ].map(({ icon: Icon, label, value, helper, tone }) => {
          const toneMap: Record<string, { bg: string; fg: string }> = { blue: { bg: '#eff6ff', fg: '#1d4ed8' }, green: { bg: '#f0fdf4', fg: '#15803d' }, amber: { bg: '#fffbeb', fg: '#b45309' }, red: { bg: '#fef2f2', fg: '#b91c1c' }, slate: { bg: '#f8fafc', fg: '#64748b' }, purple: { bg: '#f5f3ff', fg: '#7c3aed' }, sky: { bg: '#f0f9ff', fg: '#0369a1' } }
          const t = toneMap[tone] ?? { bg: '#f8fafc', fg: '#64748b' }
          return (
            <div key={label} style={{
              background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
              borderRadius: 10, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} color={t.fg} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--mt-text)', lineHeight: 1.1 }}>{value}</div>
                {helper && <div style={{ fontSize: 10, color: 'var(--mt-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{helper}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Active treatments quick view ── */}
      {activeTreatments.length > 0 && (
        <ClinicalPanel title="Tratamientos activos" icon={Pill} accent="green">
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {activeTreatments.map(t => <TreatmentCard key={t.id} treatment={t} />)}
          </div>
        </ClinicalPanel>
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-slate-100 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                  selected ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
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
          <ClinicalPanel title="Timeline clínico reciente" icon={CalendarClock}>
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
            <ClinicalPanel title="Seguimiento diario" icon={Activity}>
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
                      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
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

            <ClinicalPanel title="Resumen de expediente" icon={ClipboardList}>
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
              <form onSubmit={handleCreateProblem} className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className={labelClass}>Título del problema <span className="text-red-400">*</span></label>
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
                {problemError && <p className="text-xs text-red-500">{problemError}</p>}
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
              <div className="divide-y divide-slate-50">
                {problems.map(p => {
                  const cfg = PROBLEM_STATUS[p.status]
                  return (
                    <div key={p.id} className="flex items-start gap-4 px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        #{p.problem_number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">{p.title}</p>
                          <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
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
          <ClinicalPanel title="Antecedentes" icon={BookOpen} accent="purple">
            <div className="divide-y divide-slate-50">
              {BG_CATEGORY_ORDER.map(category => {
                const cfg = BG_LABELS[category]
                const record = background.find(b => b.category === category)
                const isEditing = editingCategory === category

                return (
                  <div key={category} className="px-5 py-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusPill tone={cfg.tone}>{category}</StatusPill>
                        <span className="text-xs font-medium text-slate-600">{cfg.label}</span>
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => startEditBg(category)}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          rows={3}
                          placeholder="Registra los antecedentes en esta categoría..."
                          className="w-full resize-none rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        {bgError && <p className="text-xs text-red-500">{bgError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveBackground}
                            disabled={savingBg}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-60 transition-colors"
                          >
                            {savingBg ? <Loader2 size={11} className="animate-spin" /> : null}
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditingCategory(null)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : record?.content ? (
                      <p className="text-sm text-slate-600 leading-relaxed">{record.content}</p>
                    ) : (
                      <p className="text-xs italic text-slate-300">Sin registro</p>
                    )}
                  </div>
                )
              })}
            </div>
          </ClinicalPanel>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ENCOUNTERS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'encounters' && (
        <ClinicalPanel
          title={`Consultas${encounters.length > 0 ? ` (${encounters.length})` : ''}`}
          icon={Stethoscope}
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
            <form onSubmit={handleCreateEncounter} className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
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
              {encError && <p className="text-xs text-red-500">{encError}</p>}
              <button type="submit" disabled={creatingEnc} className={submitBtnClass}>
                {creatingEnc ? <Loader2 size={14} className="animate-spin" /> : null}
                Abrir consulta
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-50">
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
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-800">
                      {ENC_LABELS[enc.encounter_type] ?? enc.encounter_type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${ENC_STATUS_COLORS[enc.status]}`}>
                      {enc.status === 'OPEN' ? 'Abierta' : enc.status === 'CLOSED' ? 'Cerrada' : enc.status}
                    </span>
                  </div>
                  {enc.chief_complaint && (
                    <p className="text-xs text-slate-500 truncate">{enc.chief_complaint}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">
                    {new Date(enc.opened_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <ExternalLink size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </ClinicalPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TREATMENTS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'treatments' && (
        <ClinicalPanel title="Tratamientos del paciente" icon={Pill}>
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
            actions={<StatusPill tone={adherenceTone}>{adherence.overall_score}%</StatusPill>}
          >
            <div className="p-5">
              <AdherenceCalendar
                days={adherence.days}
                streak={adherence.streak}
                overallScore={adherence.overall_score}
              />
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Confirmadas: <strong className="text-slate-700">{adherence.confirmed}</strong></span>
                <span>Perdidas: <strong className="text-slate-700">{adherence.missed}</strong></span>
                <span>Total: <strong className="text-slate-700">{adherence.total}</strong></span>
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
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
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
            <div className="divide-y divide-slate-50">
              {labOrders.map(order => {
                const cfg = ORDER_STATUS_CONFIG[order.status]
                const critical = order.results.filter(r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW').length
                const abnormal = order.results.filter(r => r.status === 'HIGH' || r.status === 'LOW').length
                return (
                  <Link
                    key={order.id}
                    href={`/lab/${order.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800">
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
                        <span className="text-slate-400">{order.results.length} parámetro{order.results.length !== 1 ? 's' : ''}</span>
                        {critical > 0 && <span className="font-bold text-red-600">{critical} crítico{critical > 1 ? 's' : ''}</span>}
                        {critical === 0 && abnormal > 0 && <span className="font-semibold text-amber-600">{abnormal} fuera de rango</span>}
                        {critical === 0 && abnormal === 0 && order.results.length > 0 && order.results.every(r => r.status === 'NORMAL') && (
                          <span className="text-emerald-600">Todos normales</span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </ClinicalPanel>
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
              <form onSubmit={handleRecordConsent} className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
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
                {consentError && <p className="text-xs text-red-500">{consentError}</p>}
                <button type="submit" disabled={savingConsent} className={submitBtnClass}>
                  {savingConsent ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar consentimiento
                </button>
              </form>
            )}

            <div className="divide-y divide-slate-50">
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
                        <span className="text-sm font-medium text-slate-800">{consentTypeLabel[c.consent_type] ?? c.consent_type}</span>
                        <StatusPill tone={isActive ? 'green' : 'slate'}>{isActive ? 'Activo' : 'Retirado'}</StatusPill>
                      </div>
                      {c.description && <p className="text-xs text-slate-500 mb-0.5">{c.description}</p>}
                      <p className="text-xs text-slate-400">
                        Consentido: {new Date(c.consented_at).toLocaleDateString('es')}
                        {c.recorded_by_email ? ` · Por: ${c.recorded_by_email}` : ''}
                        {c.withdrawn_at ? ` · Retirado: ${new Date(c.withdrawn_at).toLocaleDateString('es')}` : ''}
                      </p>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleWithdrawConsent(c.id)}
                        title="Retirar consentimiento"
                        className="text-slate-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
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
          <ClinicalPanel title="RGPD / GDPR" icon={Download} accent="red">
            <div className="flex flex-col gap-6 px-5 py-5">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Exportar datos del paciente</p>
                <p className="text-xs text-slate-400 mb-3">
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

              <hr className="border-slate-100" />

              <div>
                <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertTriangle size={14} /> Anonimizar datos personales
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Elimina irreversiblemente nombre, fecha de nacimiento, teléfono, email y número de documento.
                  Los datos médicos se conservan por obligación legal. Esta acción no se puede deshacer.
                </p>
                {patient?.anonymized_at ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                    Paciente anonimizado el {new Date(patient.anonymized_at as unknown as string).toLocaleDateString('es')}
                  </p>
                ) : !anonymizeConfirm ? (
                  <button
                    onClick={() => setAnonymizeConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} /> Anonimizar paciente
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-red-600 font-medium">¿Confirmar? Esta acción es irreversible.</span>
                    <button
                      onClick={handleAnonymize}
                      disabled={anonymizing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
                    >
                      {anonymizing ? <Loader2 size={12} className="animate-spin" /> : null}
                      Sí, anonimizar
                    </button>
                    <button
                      onClick={() => setAnonymizeConfirm(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
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
