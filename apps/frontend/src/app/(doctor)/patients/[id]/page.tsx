'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Plus, ChevronUp, ChevronDown,
  QrCode, Link2, Hash, Loader2, ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getPatient, listEncounters, createEncounter, listDocuments,
  generatePortalAccess, type Patient, type Encounter, type Document, type AccessResult,
} from '@/lib/doctor/api'
import { DocumentUploader } from '@/components/doctor/DocumentUploader'
import { DocumentList } from '@/components/doctor/DocumentList'
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

// ─── Portal access section ─────────────────────────────────────────────────────
function PortalAccessSection({ token, patientId }: { token: string; patientId: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<AccessResult | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate(channel: 'magic_link' | 'qr' | 'pin') {
    setLoading(channel)
    setResult(null)
    setQrDataUrl(null)
    try {
      const data = await generatePortalAccess(token, patientId, channel)
      setResult(data)
      if ('qr_data' in data && (channel === 'qr' || channel === 'magic_link')) {
        const url = await QRCode.toDataURL(data.qr_data, { width: 240, margin: 2 })
        setQrDataUrl(url)
      }
    } finally {
      setLoading(null)
    }
  }

  async function copyLink() {
    if (!result || !('access_url' in result)) return
    await navigator.clipboard.writeText(result.access_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Link2 size={16} className="text-slate-500" />
          Acceso al portal del paciente
        </h2>
      </div>
      <div className="px-5 py-4">
        <p className="text-xs text-slate-500 mb-4">Genera un enlace o PIN para que el paciente acceda a su portal de salud.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { channel: 'qr' as const, label: 'Código QR', icon: <QrCode size={14} /> },
            { channel: 'magic_link' as const, label: 'Enlace mágico', icon: <Link2 size={14} /> },
            { channel: 'pin' as const, label: 'PIN numérico', icon: <Hash size={14} /> },
          ].map(({ channel, label, icon }) => (
            <button
              key={channel}
              onClick={() => generate(channel)}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 transition-colors"
            >
              {loading === channel ? <Loader2 size={14} className="animate-spin" /> : icon}
              {label}
            </button>
          ))}
        </div>

        {result && (
          <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center gap-3">
            {'pin' in result && result.channel === 'pin' ? (
              <>
                <p className="text-xs text-slate-500">PIN de acceso del paciente</p>
                <p className="text-4xl font-bold tracking-[0.3em] text-blue-600">{result.pin}</p>
                <p className="text-xs text-slate-400">
                  Url: <span className="font-medium">{result.access_url}</span>
                </p>
              </>
            ) : (
              <>
                {qrDataUrl && (
                  <img src={qrDataUrl} alt="QR de acceso" className="rounded-lg" width={200} />
                )}
                <div className="flex items-center gap-2 w-full">
                  <input
                    readOnly
                    value={'access_url' in result ? result.access_url : ''}
                    className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 truncate"
                  />
                  <button
                    onClick={copyLink}
                    className="text-xs px-3 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors whitespace-nowrap"
                  >
                    {copied ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
              </>
            )}
            <p className="text-xs text-slate-400">
              Expira: {new Date('expires_at' in result ? result.expires_at : '').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
    </section>
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

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const patientId = params.id as string

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loadingPage, setLoadingPage] = useState(true)

  // encounter create form
  const [showNewEnc, setShowNewEnc] = useState(false)
  const [encType, setEncType] = useState('CONSULTATION')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [encNotes, setEncNotes] = useState('')
  const [creatingEnc, setCreatingEnc] = useState(false)
  const [encError, setEncError] = useState('')

  // documents
  const [showUploader, setShowUploader] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoadingPage(true)
    try {
      const [p, encs, docs] = await Promise.all([
        getPatient(token, patientId),
        listEncounters(token, patientId),
        listDocuments(token, patientId),
      ])
      setPatient(p)
      setEncounters(encs)
      setDocuments(docs)
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

  function handleUploaded(doc: Document) {
    setDocuments(prev => [doc, ...prev])
    setShowUploader(false)
  }

  if (loadingPage) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    )
  }

  if (!patient) return null

  function calcAge(dob: string | null) {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/patients" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-800 truncate">
            {patient.first_name} {patient.last_name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-400">
            {patient.date_of_birth && <span>{calcAge(patient.date_of_birth)} años</span>}
            {patient.sex && <span>{{ male: 'Masculino', female: 'Femenino', other: 'Otro' }[patient.sex]}</span>}
            {patient.id_number && <span>CI: {patient.id_number}</span>}
            {patient.email && <span>{patient.email}</span>}
            {patient.phone && <span>{patient.phone}</span>}
          </div>
        </div>
      </div>

      {/* Encounters */}
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

      {/* Portal access */}
      {token && <PortalAccessSection token={token} patientId={patientId} />}

      {/* Documents */}
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
    </div>
  )
}
