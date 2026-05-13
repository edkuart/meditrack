'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Plus, ChevronUp, ChevronDown,
  QrCode, Link2, Hash, Loader2, ExternalLink, Download,
  Activity, CalendarClock, ClipboardList, Pill, Stethoscope, UserRound,
  ShieldCheck, Trash2, AlertTriangle, Copy,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getPatient, listEncounters, createEncounter, listDocuments,
  generatePortalAccess, getPatientFhirBundle, listPatientTreatments,
  type Patient, type Encounter, type Document, type AccessResult, type TreatmentPlan,
} from '@/lib/doctor/api'
import {
  getPatientConsents, recordConsent, withdrawConsent, exportPatientData, anonymizePatient,
  type PatientConsent, type ConsentType,
} from '@/lib/doctor/compliance-api'
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
  MetricCard,
  StatusPill,
  type TimelineItem,
} from '@/components/doctor/clinical-ui'
import QRCode from 'qrcode'

// ─── Encounter type labels ─────────────────────────────────────────────────────
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

const portalAccessStorageKey = (patientId: string) => `meditrack.portalAccess.${patientId}`

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

        if (cancelled) return
        setResult(saved)

        if ('qr_data' in saved) {
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

  async function generate(channel: 'magic_link' | 'qr' | 'pin') {
    setLoading(channel)
    setError('')
    setCopied(false)
    setQrDataUrl(null)
    try {
      const data = await generatePortalAccess(token, patientId, channel)
      setResult(data)
      if (data.channel !== 'pin') {
        window.localStorage.setItem(portalAccessStorageKey(patientId), JSON.stringify(data))
      }
      if ('qr_data' in data) {
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
      await navigator.clipboard.writeText(result.access_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.')
    }
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
                : 'Genera un enlace, QR o PIN para entregar el portal al paciente.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { channel: 'magic_link' as const, label: 'Enlace mágico', icon: <Link2 size={14} /> },
            { channel: 'qr' as const, label: 'Código QR', icon: <QrCode size={14} /> },
            { channel: 'pin' as const, label: 'PIN numérico', icon: <Hash size={14} /> },
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

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {result && (
          <div className="rounded-xl border border-green-100 bg-green-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-green-700">
                {result.channel === 'pin' ? 'PIN listo para entregar' : 'Link listo para entregar'}
              </p>
              <p className="text-xs text-slate-500">
                Expira: {new Date(result.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {result.channel === 'pin' && 'pin' in result ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-green-100 bg-white px-4 py-5 text-center">
                  <p className="text-xs text-slate-500">PIN de acceso del paciente</p>
                  <p className="mt-2 text-4xl font-bold tracking-[0.25em] text-blue-600">{result.pin}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={result.access_url}
                    className="min-w-0 flex-1 rounded-lg border border-green-100 bg-white px-3 py-2 text-xs text-slate-700"
                  />
                  <button
                    onClick={copyLink}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-green-100 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50"
                  >
                    <Copy size={14} />
                    {copied ? 'Copiado' : 'Copiar URL'}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Por seguridad, el PIN se muestra al generarlo. Si se pierde, genera uno nuevo.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                {qrDataUrl && (
                  <div className="flex justify-center rounded-xl border border-green-100 bg-white p-3">
                    <img src={qrDataUrl} alt="QR de acceso al portal" className="h-48 w-48 rounded-lg" />
                  </div>
                )}
                <div className="flex min-w-0 flex-col justify-center gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      readOnly
                      value={'access_url' in result ? result.access_url : ''}
                      className="min-w-0 flex-1 rounded-lg border border-green-100 bg-white px-3 py-2 text-xs text-slate-700"
                    />
                    <button
                      onClick={copyLink}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-green-100 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50"
                    >
                      <Copy size={14} />
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    {'access_url' in result && (
                      <Link
                        href={result.access_url}
                        target="_blank"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-green-100 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50"
                      >
                        <ExternalLink size={14} />
                        Abrir
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Este mismo acceso queda disponible al volver al expediente desde este navegador.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ClinicalPanel>
  )
}

// ─── New encounter inline form ─────────────────────────────────────────────────
const ENC_TYPES = [
  { value: 'CONSULTATION', label: 'Consulta' },
  { value: 'FOLLOW_UP', label: 'Seguimiento' },
  { value: 'POST_HOSPITALIZATION', label: 'Post-hospitalización' },
  { value: 'DISCHARGE', label: 'Alta' },
  { value: 'CHRONIC_CONTROL', label: 'Control crónico' },
  { value: 'EMERGENCY', label: 'Urgencia' },
]

type PatientTab = 'summary' | 'encounters' | 'treatments' | 'adherence' | 'documents' | 'access' | 'compliance'

const TABS: Array<{ id: PatientTab; label: string; icon: typeof FileText }> = [
  { id: 'summary', label: 'Resumen', icon: Activity },
  { id: 'encounters', label: 'Consultas', icon: Stethoscope },
  { id: 'treatments', label: 'Tratamientos', icon: Pill },
  { id: 'adherence', label: 'Adherencia', icon: CalendarClock },
  { id: 'documents', label: 'Documentos', icon: FileText },
  { id: 'access', label: 'Portal', icon: Link2 },
  { id: 'compliance', label: 'Cumplimiento', icon: ShieldCheck },
]

const TREATMENT_STATUS: Record<TreatmentPlan['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  ACTIVE: { label: 'Activo', tone: 'green' },
  DRAFT: { label: 'Borrador', tone: 'amber' },
  COMPLETED: { label: 'Completado', tone: 'slate' },
  SUSPENDED: { label: 'Suspendido', tone: 'amber' },
  CANCELLED: { label: 'Cancelado', tone: 'red' },
}

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
      </div>
    </Link>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const patientId = params.id as string

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [treatments, setTreatments] = useState<TreatmentPlan[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [adherence, setAdherence] = useState<PatientAdherenceReport | null>(null)
  const [consents, setConsents] = useState<PatientConsent[]>([])
  const [loadingPage, setLoadingPage] = useState(true)
  const [activeTab, setActiveTab] = useState<PatientTab>('summary')

  // compliance tab state
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

  // encounter create form
  const [showNewEnc, setShowNewEnc] = useState(false)
  const [encType, setEncType] = useState('CONSULTATION')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [encNotes, setEncNotes] = useState('')
  const [creatingEnc, setCreatingEnc] = useState(false)
  const [encError, setEncError] = useState('')

  // documents
  const [showUploader, setShowUploader] = useState(false)

  // FHIR export
  const [exportingFhir, setExportingFhir] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoadingPage(true)
    try {
      const [p, encs, plans, docs, adh, cons] = await Promise.all([
        getPatient(token, patientId),
        listEncounters(token, patientId),
        listPatientTreatments(token, patientId).catch(() => []),
        listDocuments(token, patientId),
        getPatientAdherence(token, patientId, 30).catch(() => null),
        getPatientConsents(token, patientId).catch(() => []),
      ])
      setPatient(p)
      setEncounters(encs)
      setTreatments(plans)
      setDocuments(docs)
      setAdherence(adh)
      setConsents(cons)
    } finally {
      setLoadingPage(false)
    }
  }, [token, patientId])

  useEffect(() => { load() }, [load])

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

  if (loadingPage) {
    return (
      <ClinicalPage>
        <LoadingState label="Cargando expediente clínico..." />
      </ClinicalPage>
    )
  }

  if (!patient) return null

  function calcAge(dob: string | null) {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
  }

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

  const age = calcAge(patient.date_of_birth)
  const activeTreatments = treatments.filter(t => t.status === 'ACTIVE')
  const draftTreatments = treatments.filter(t => t.status === 'DRAFT')
  const adherenceTone: 'green' | 'amber' | 'red' = adherence && adherence.overall_score >= 80
    ? 'green'
    : adherence && adherence.overall_score >= 50
      ? 'amber'
      : 'red'

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Expediente clínico"
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={patient.notes ?? 'Resumen operativo del paciente, consultas, adherencia y acceso al portal.'}
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

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Stethoscope} label="Consultas" value={encounters.length} tone="blue" />
        <MetricCard
          icon={Pill}
          label="Tratamientos activos"
          value={activeTreatments.length}
          helper={draftTreatments.length > 0 ? `${draftTreatments.length} borrador(es)` : `${treatments.length} totales`}
          tone={activeTreatments.length > 0 ? 'green' : 'slate'}
        />
        <MetricCard
          icon={CalendarClock}
          label="Adherencia 30 días"
          value={adherence && adherence.total > 0 ? `${adherence.overall_score}%` : '—'}
          helper={adherence && adherence.total > 0 ? `${adherence.confirmed} de ${adherence.total} dosis` : 'Sin dosis en el periodo'}
          tone={adherence && adherence.total > 0 ? adherenceTone : 'slate'}
        />
      </div>

      {activeTreatments.length > 0 && (
        <ClinicalPanel title="Tratamientos activos" icon={Pill}>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {activeTreatments.map(treatment => <TreatmentCard key={treatment.id} treatment={treatment} />)}
          </div>
        </ClinicalPanel>
      )}

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

      {activeTab === 'summary' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ClinicalPanel title="Timeline clínico reciente" icon={CalendarClock}>
            {timelineItems.length > 0 ? (
              <ClinicalTimeline items={timelineItems} />
            ) : (
              <EmptyClinicalState
                icon={CalendarClock}
                title="Sin actividad clínica reciente"
                description="Cuando registres consultas o documentos, aparecerán aquí para lectura rápida."
              />
            )}
          </ClinicalPanel>

          <ClinicalPanel title="Resumen de expediente" icon={ClipboardList}>
            <div className="flex flex-col gap-3 p-4">
              <ClinicalInsight tone={activeTreatments.length > 0 ? 'green' : 'blue'} title="Tratamientos">
                {activeTreatments.length > 0
                  ? `${activeTreatments.length} tratamiento(s) activo(s) en seguimiento.`
                  : 'No hay tratamientos activos registrados para este paciente.'}
              </ClinicalInsight>
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
      )}

      {activeTab === 'encounters' && (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Consultas</h2>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              {encounters.length}
            </span>
          </div>
          <button
            onClick={() => { setShowNewEnc(v => !v); setEncError('') }}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700"
          >
            {showNewEnc ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Nueva consulta</>}
          </button>
        </div>

        {/* New encounter form */}
        {showNewEnc && (
          <form onSubmit={handleCreateEncounter} className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Tipo de consulta</label>
              <select
                value={encType}
                onChange={e => setEncType(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              >
                {ENC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Motivo de consulta</label>
              <input
                value={chiefComplaint}
                onChange={e => setChiefComplaint(e.target.value)}
                placeholder="Dolor de cabeza, control de hipertensión..."
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Notas iniciales</label>
              <textarea
                value={encNotes}
                onChange={e => setEncNotes(e.target.value)}
                rows={2}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none"
              />
            </div>
            {encError && <p className="text-red-500 text-xs">{encError}</p>}
            <button
              type="submit"
              disabled={creatingEnc}
              className="self-end flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-600 transition-colors"
            >
              {creatingEnc ? <Loader2 size={14} className="animate-spin" /> : null}
              Abrir consulta
            </button>
          </form>
        )}

        {/* Encounter list */}
        <div className="divide-y divide-slate-50">
          {encounters.length === 0 && !showNewEnc && (
            <p className="text-center text-sm text-slate-400 py-8">No hay consultas registradas</p>
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
      </section>
      )}

      {activeTab === 'treatments' && (
        <ClinicalPanel title="Tratamientos del paciente" icon={Pill}>
          {treatments.length > 0 ? (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {treatments.map(treatment => <TreatmentCard key={treatment.id} treatment={treatment} />)}
            </div>
          ) : (
            <EmptyClinicalState
              icon={Pill}
              title="Sin tratamientos registrados"
              description="Crea una consulta y agrega un plan de tratamiento para iniciar seguimiento."
              action={
                <ClinicalButton
                  icon={Plus}
                  onClick={() => {
                    setActiveTab('encounters')
                    setShowNewEnc(true)
                  }}
                >
                  Nueva consulta
                </ClinicalButton>
              }
            />
          )}
        </ClinicalPanel>
      )}

      {/* Portal access */}
      {activeTab === 'access' && token && (
        <PortalAccessSection token={token} patientId={patientId} treatments={treatments} />
      )}

      {/* Adherence */}
      {activeTab === 'adherence' && adherence && adherence.total > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">Adherencia — últimos 30 días</h2>
            <StatusPill tone={adherenceTone}>{adherence.overall_score}%</StatusPill>
          </div>
          <AdherenceCalendar
            days={adherence.days}
            streak={adherence.streak}
            overallScore={adherence.overall_score}
          />
          <div className="flex gap-4 mt-4 text-xs text-slate-500">
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
        </section>
      )}

      {activeTab === 'adherence' && (!adherence || adherence.total === 0) && (
        <EmptyClinicalState
          icon={CalendarClock}
          title="Sin datos de adherencia"
          description="La adherencia aparecerá cuando existan dosis programadas y confirmaciones del paciente."
        />
      )}

      {/* Compliance */}
      {activeTab === 'compliance' && (
        <div className="flex flex-col gap-4">
          {/* Consent list */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-slate-500" />
                <h2 className="font-semibold text-slate-800">Consentimientos</h2>
                <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{consents.length}</span>
              </div>
              <button
                onClick={() => setShowConsentForm(v => !v)}
                className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700"
              >
                {showConsentForm ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Registrar</>}
              </button>
            </div>

            {showConsentForm && (
              <form onSubmit={handleRecordConsent} className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Tipo</label>
                    <select
                      value={consentType}
                      onChange={e => setConsentType(e.target.value as ConsentType)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                    >
                      <option value="data_processing">Tratamiento de datos</option>
                      <option value="treatment">Tratamiento médico</option>
                      <option value="third_party_sharing">Compartir con terceros</option>
                      <option value="research">Investigación</option>
                      <option value="marketing">Marketing</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Fecha de consentimiento</label>
                    <input
                      type="date"
                      value={consentedAt}
                      onChange={e => setConsentedAt(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Descripción (opcional)</label>
                  <input
                    value={consentDesc}
                    onChange={e => setConsentDesc(e.target.value)}
                    placeholder="Ej: Política de privacidad v2.1, consentimiento informado procedimiento X..."
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Notas internas</label>
                  <textarea
                    value={consentNotes}
                    onChange={e => setConsentNotes(e.target.value)}
                    rows={2}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none"
                  />
                </div>
                {consentError && <p className="text-red-500 text-xs">{consentError}</p>}
                <button
                  type="submit"
                  disabled={savingConsent}
                  className="self-end flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-600 transition-colors"
                >
                  {savingConsent ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar consentimiento
                </button>
              </form>
            )}

            <div className="divide-y divide-slate-50">
              {consents.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No hay consentimientos registrados</p>
              )}
              {consents.map(c => {
                const typeLabel: Record<string, string> = {
                  data_processing: 'Tratamiento de datos',
                  treatment: 'Tratamiento médico',
                  third_party_sharing: 'Compartir con terceros',
                  research: 'Investigación',
                  marketing: 'Marketing',
                }
                const isActive = !c.withdrawn_at
                return (
                  <div key={c.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800">{typeLabel[c.consent_type] ?? c.consent_type}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {isActive ? 'Activo' : 'Retirado'}
                        </span>
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
          </section>

          {/* Data export & anonymization */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Download size={16} className="text-slate-500" />
                RGPD / GDPR
              </h2>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Exportar datos del paciente</p>
                <p className="text-xs text-slate-400 mb-3">Descarga un JSON con todos los datos del paciente (consultas, tratamientos, consentimientos) para cumplir con el derecho de portabilidad.</p>
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
                <p className="text-sm font-medium text-red-600 mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Anonimizar datos personales
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Elimina irreversiblemente nombre, fecha de nacimiento, teléfono, email y número de documento del paciente.
                  Los datos médicos (consultas, tratamientos) se conservan por obligación legal. Esta acción no se puede deshacer.
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
                  <div className="flex items-center gap-3">
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
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Documents */}
      {activeTab === 'documents' && (
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Documentos</h2>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              {documents.length}
            </span>
          </div>
          <button
            onClick={() => setShowUploader(v => !v)}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700"
          >
            {showUploader ? <><ChevronUp size={15} /> Cancelar</> : <><Plus size={15} /> Subir</>}
          </button>
        </div>
        {showUploader && token && (
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <DocumentUploader token={token} patientId={patientId} onUploaded={handleUploaded} />
          </div>
        )}
        <div className="px-5 py-4">
          {token && (
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
      </section>
      )}
    </ClinicalPage>
  )
}
