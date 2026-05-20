'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Download, Loader2,
  FolderOpen, Pill, FlaskConical, Scan, ClipboardList, FileSignature,
} from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getDocuments, getDocumentUrl, isUnauthorizedPortalError, type PatientDocument } from '@/lib/portal/api'

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  label: string
  color: string
  bg: string
  icon: React.ElementType
}> = {
  PRESCRIPTION:  { label: 'Receta',             color: '#2563eb', bg: '#eff6ff', icon: Pill          },
  LAB_RESULT:    { label: 'Análisis de lab',     color: '#059669', bg: '#ecfdf5', icon: FlaskConical  },
  IMAGING:       { label: 'Imagen diagnóstica',  color: '#7c3aed', bg: '#f5f3ff', icon: Scan          },
  CONSENT:       { label: 'Consentimiento',      color: '#d97706', bg: '#fffbeb', icon: FileSignature },
  CLINICAL_NOTE: { label: 'Nota clínica',        color: '#475569', bg: '#f8fafc', icon: ClipboardList },
  OTHER:         { label: 'Documento',           color: '#64748b', bg: '#f8fafc', icon: FileText      },
}

function getTypeCfg(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.OTHER
}

// ─── Filter chips ──────────────────────────────────────────────────────────────

const FILTERS = [
  { value: '',               label: 'Todos'        },
  { value: 'PRESCRIPTION',  label: 'Recetas'       },
  { value: 'LAB_RESULT',    label: 'Análisis'      },
  { value: 'IMAGING',       label: 'Imágenes'      },
  { value: 'CLINICAL_NOTE', label: 'Notas'         },
  { value: 'CONSENT',       label: 'Consentimientos' },
]

// ─── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, token }: { doc: PatientDocument; token: string }) {
  const [loading, setLoading] = useState(false)
  const cfg = getTypeCfg(doc.type)
  const Icon = cfg.icon

  async function handleOpen() {
    setLoading(true)
    try {
      const { url } = await getDocumentUrl(token, doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{doc.file_name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-slate-200">·</span>
          <span className="text-xs text-slate-400">
            {new Date(doc.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <button
        onClick={handleOpen}
        disabled={loading}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
        title="Abrir documento"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs]     = useState<PatientDocument[]>([])
  const [token, setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal'); return }
    setToken(session.token)

    getDocuments(session.token)
      .then(setDocs)
      .catch((err) => {
        if (isUnauthorizedPortalError(err)) {
          clearSession()
          router.replace('/portal')
        }
      })
      .finally(() => setLoading(false))
  }, [router])

  const visible = filter ? docs.filter(d => d.type === filter) : docs

  // Only show filter chips that have at least one matching document
  const availableFilters = FILTERS.filter(
    f => f.value === '' || docs.some(d => d.type === f.value),
  )

  if (loading) {
    return (
      <div className="portal-body flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="portal-body pb-24">
      <div className="mx-auto max-w-md">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <Link
            href="/portal"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shrink-0"
          >
            <ArrowLeft size={18} className="text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Mis documentos</h1>
            <p className="text-sm text-slate-400">Lo que tu médico ha compartido contigo</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5">

          {docs.length === 0 ? (
            <>
              <div className="py-14 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <FolderOpen size={26} className="text-slate-400" />
                </div>
                <p className="font-semibold text-slate-700">Sin documentos aún</p>
                <p className="mt-1 text-sm text-slate-400 leading-relaxed px-4">
                  Aquí aparecerán recetas, notas clínicas e imágenes diagnósticas que tu médico decida compartir contigo.
                </p>
              </div>

              {/* Clarification: difference from Lab */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex items-start gap-3">
                <FlaskConical size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">¿Buscas tus análisis de laboratorio?</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Los resultados de exámenes están en la sección{' '}
                    <Link href="/portal/lab" className="text-blue-600 font-medium">Lab</Link>.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Filter chips */}
              {availableFilters.length > 2 && (
                <div className="flex gap-2 flex-wrap">
                  {availableFilters.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filter === f.value
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                      {f.value && (
                        <span className="ml-1.5 opacity-60">
                          {docs.filter(d => d.type === f.value).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Document count */}
              <p className="text-xs text-slate-400 px-1">
                {visible.length} documento{visible.length !== 1 ? 's' : ''}
                {filter ? ` · ${getTypeCfg(filter).label}` : ''}
              </p>

              {/* Document list */}
              {token && visible.map(doc => (
                <DocRow key={doc.id} doc={doc} token={token} />
              ))}

              {visible.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">
                  No hay documentos de este tipo.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
