'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Download, Loader2 } from 'lucide-react'
import { getSession } from '@/lib/portal/session'
import { getDocuments, getDocumentUrl, type PatientDocument } from '@/lib/portal/api'

const TYPE_LABELS: Record<string, string> = {
  PRESCRIPTION: 'Receta médica',
  LAB_RESULT: 'Análisis de laboratorio',
  IMAGING: 'Imagen diagnóstica',
  CONSENT: 'Consentimiento informado',
  CLINICAL_NOTE: 'Nota clínica',
  OTHER: 'Documento',
}

const TYPE_COLORS: Record<string, string> = {
  PRESCRIPTION: 'bg-blue-50 text-blue-600',
  LAB_RESULT: 'bg-green-50 text-green-600',
  IMAGING: 'bg-purple-50 text-purple-600',
  CONSENT: 'bg-amber-50 text-amber-600',
  CLINICAL_NOTE: 'bg-slate-50 text-slate-600',
  OTHER: 'bg-slate-50 text-slate-500',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocRow({ doc, token }: { doc: PatientDocument; token: string }) {
  const [loading, setLoading] = useState(false)

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
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-4">
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TYPE_COLORS[doc.type] ?? TYPE_COLORS.OTHER}`}>
        <FileText size={18} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 text-sm truncate">{doc.file_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-400">
            {TYPE_LABELS[doc.type] ?? 'Documento'}
          </span>
          <span className="text-slate-200">·</span>
          <span className="text-xs text-slate-400">
            {new Date(doc.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleOpen}
        disabled={loading}
        className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 transition-colors shrink-0"
        title="Abrir documento"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </button>
    </div>
  )
}

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<PatientDocument[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (!session) { router.replace('/portal/auth'); return }
    setToken(session.token)

    getDocuments(session.token)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto min-h-screen pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <Link
          href="/portal"
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-slate-600" />
        </Link>
        <h1 className="text-slate-800 text-xl font-semibold">Mis documentos</h1>
      </div>

      <div className="px-5 flex flex-col gap-3">
        {docs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">📂</p>
            <p className="text-slate-600 font-medium">Sin documentos compartidos</p>
            <p className="text-sm mt-1">Tu médico podrá compartir recetas, análisis y más aquí</p>
          </div>
        ) : (
          <>
            <p className="text-slate-400 text-sm px-1">{docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
            {token && docs.map(doc => (
              <DocRow key={doc.id} doc={doc} token={token} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
