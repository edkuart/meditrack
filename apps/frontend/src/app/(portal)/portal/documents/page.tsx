'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Download, Loader2, FolderOpen } from 'lucide-react'
import { clearSession, getSession } from '@/lib/portal/session'
import { getDocuments, getDocumentUrl, isUnauthorizedPortalError, type PatientDocument } from '@/lib/portal/api'

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
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TYPE_COLORS[doc.type] ?? TYPE_COLORS.OTHER}`}>
        <FileText size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{doc.file_name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {TYPE_LABELS[doc.type] ?? 'Documento'}
          </span>
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

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<PatientDocument[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <div className="portal-body flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="portal-body">
    <div className="mx-auto max-w-md">

      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        <Link
          href="/portal"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
        >
          <ArrowLeft size={18} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mis documentos</h1>
          <p className="text-sm text-slate-400">Archivos compartidos por tu equipo médico</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5">
        {docs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
              <FolderOpen size={26} />
            </div>
            <p className="font-medium text-slate-700">Sin documentos compartidos</p>
            <p className="mt-1 text-sm">Tu médico podrá compartir recetas, análisis y más aquí.</p>
          </div>
        ) : (
          <>
            <p className="px-1 text-sm text-slate-400">{docs.length} documento{docs.length !== 1 ? 's' : ''}</p>
            {token && docs.map(doc => (
              <DocRow key={doc.id} doc={doc} token={token} />
            ))}
          </>
        )}
      </div>
    </div>
    </div>
  )
}
