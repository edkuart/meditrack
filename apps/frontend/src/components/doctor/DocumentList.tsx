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

const TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  PRESCRIPTION: { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)' },
  LAB_RESULT:   { bg: 'var(--mt-purple-subtle)', color: 'var(--mt-purple-deep)' },
  IMAGING:      { bg: '#FEF3C7', color: '#92400E' },
  CONSENT:      { bg: 'var(--mt-success-subtle)', color: '#065F46' },
  CLINICAL_NOTE:{ bg: 'var(--mt-elevated)', color: 'var(--mt-text-2)' },
  OTHER:        { bg: 'var(--mt-elevated)', color: 'var(--mt-muted)' },
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
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--mt-muted)' }}>
        <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block' }} />
        <p style={{ fontSize: 13, margin: 0 }}>No hay documentos adjuntos</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {documents.map(doc => {
        const isPdf = doc.mime_type === 'application/pdf'
        const isLoading = loadingId === doc.id
        const typeStyle = TYPE_STYLES[doc.type] ?? TYPE_STYLES['OTHER']

        return (
          <div
            key={doc.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: 12, borderRadius: 12,
              border: '1px solid var(--mt-border)',
              background: 'var(--mt-surface)',
              transition: 'background .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--mt-surface)')}
          >
            {/* Icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: 'var(--mt-elevated)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isPdf
                ? <FileText size={16} color="var(--mt-danger)" />
                : <Image size={16} color="var(--mt-primary)" />
              }
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                color: 'var(--mt-text)', fontSize: 13, fontWeight: 500,
                margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {doc.file_name}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{
                  fontSize: 11, padding: '2px 6px', borderRadius: 5, fontWeight: 500,
                  background: typeStyle.bg, color: typeStyle.color,
                }}>
                  {TYPE_LABELS[doc.type] ?? doc.type}
                </span>
                <span style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                  {formatFileSize(doc.file_size)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {isLoading ? (
                <Loader2 size={16} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  <ActionBtn onClick={() => handleView(doc)} title="Ver documento">
                    <ExternalLink size={15} />
                  </ActionBtn>
                  <ActionBtn
                    onClick={() => handleToggleVisibility(doc)}
                    title={doc.is_visible_to_patient ? 'Ocultar al paciente' : 'Mostrar al paciente'}
                    color={doc.is_visible_to_patient ? 'var(--mt-success)' : undefined}
                  >
                    {doc.is_visible_to_patient ? <Eye size={15} /> : <EyeOff size={15} />}
                  </ActionBtn>
                  <ActionBtn onClick={() => handleDelete(doc)} title="Eliminar" danger>
                    <Trash2 size={15} />
                  </ActionBtn>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ActionBtn({
  children, onClick, title, danger, color,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  color?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32, height: 32, borderRadius: 8, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        background: hovered
          ? danger ? 'var(--mt-danger-subtle)' : 'var(--mt-elevated)'
          : 'transparent',
        color: hovered
          ? danger ? 'var(--mt-danger)' : color ?? 'var(--mt-text-2)'
          : color ?? 'var(--mt-muted)',
        transition: 'background .15s, color .15s',
      }}
    >
      {children}
    </button>
  )
}
