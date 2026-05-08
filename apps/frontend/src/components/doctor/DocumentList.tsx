'use client'

import { useState } from 'react'
import { FileText, Image, Eye, EyeOff, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { getDocumentUrl, toggleDocumentVisibility, deleteDocument, formatFileSize, type Document } from '@/lib/doctor/api'

const TYPE_LABELS: Record<string, string> = {
  PRESCRIPTION: 'Receta',
  LAB_RESULT: 'Laboratorio',
  IMAGING: 'Imagen',
  CONSENT: 'Consentimiento',
  CLINICAL_NOTE: 'Nota clínica',
  OTHER: 'Otro',
}

const TYPE_COLORS: Record<string, string> = {
  PRESCRIPTION: 'bg-blue-100 text-blue-700',
  LAB_RESULT: 'bg-purple-100 text-purple-700',
  IMAGING: 'bg-amber-100 text-amber-700',
  CONSENT: 'bg-green-100 text-green-700',
  CLINICAL_NOTE: 'bg-slate-100 text-slate-600',
  OTHER: 'bg-slate-100 text-slate-500',
}

interface Props {
  token: string
  documents: Document[]
  onDeleted: (id: string) => void
  onVisibilityChanged: (id: string, visible: boolean) => void
}

export function DocumentList({ token, documents, onDeleted, onVisibilityChanged }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleView(doc: Document) {
    setLoadingId(doc.id)
    try {
      const { url } = await getDocumentUrl(token, doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoadingId(null)
    }
  }

  async function handleToggleVisibility(doc: Document) {
    setLoadingId(doc.id)
    try {
      await toggleDocumentVisibility(token, doc.id, !doc.is_visible_to_patient)
      onVisibilityChanged(doc.id, !doc.is_visible_to_patient)
    } finally {
      setLoadingId(null)
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`¿Eliminar "${doc.file_name}"? Esta acción no se puede deshacer.`)) return
    setLoadingId(doc.id)
    try {
      await deleteDocument(token, doc.id)
      onDeleted(doc.id)
    } finally {
      setLoadingId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <FileText size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay documentos adjuntos</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map(doc => {
        const isPdf = doc.mime_type === 'application/pdf'
        const isLoading = loadingId === doc.id

        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors"
          >
            {/* Icon */}
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              {isPdf
                ? <FileText size={16} className="text-red-500" />
                : <Image size={16} className="text-blue-500" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 text-sm font-medium truncate">{doc.file_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${TYPE_COLORS[doc.type] ?? TYPE_COLORS['OTHER']}`}>
                  {TYPE_LABELS[doc.type] ?? doc.type}
                </span>
                <span className="text-xs text-slate-400">{formatFileSize(doc.file_size)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {isLoading ? (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              ) : (
                <>
                  <button
                    onClick={() => handleView(doc)}
                    title="Ver documento"
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    onClick={() => handleToggleVisibility(doc)}
                    title={doc.is_visible_to_patient ? 'Ocultar al paciente' : 'Mostrar al paciente'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 ${
                      doc.is_visible_to_patient ? 'text-green-500' : 'text-slate-300 hover:text-slate-500'
                    }`}
                  >
                    {doc.is_visible_to_patient ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    title="Eliminar"
                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
