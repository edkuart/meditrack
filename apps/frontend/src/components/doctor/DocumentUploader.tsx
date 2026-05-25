'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Image, Loader2 } from 'lucide-react'
import { uploadDocument, type Document } from '@/lib/doctor/api'
import { MTButton } from '@/components/doctor/clinical-ui'

const DOC_TYPES = [
  { value: 'PRESCRIPTION', label: 'Receta' },
  { value: 'LAB_RESULT', label: 'Resultado de laboratorio' },
  { value: 'IMAGING', label: 'Imagen / Radiografía' },
  { value: 'CONSENT', label: 'Consentimiento' },
  { value: 'CLINICAL_NOTE', label: 'Nota clínica' },
  { value: 'OTHER', label: 'Otro' },
]

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

interface Props {
  token: string
  patientId: string
  encounterId?: string
  onUploaded: (doc: Document) => void
}

export function DocumentUploader({ token, patientId, encounterId, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('OTHER')
  const [visibleToPatient, setVisibleToPatient] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!ALLOWED.includes(file.type)) {
      setError('Tipo de archivo no permitido. Solo PDF, JPEG, PNG o WEBP.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('El archivo supera el límite de 20MB.')
      return
    }
    setError('')
    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    setError('')
    try {
      const doc = await uploadDocument(token, patientId, selectedFile, {
        type: docType,
        is_visible_to_patient: visibleToPatient,
        encounter_id: encounterId,
      })
      onUploaded(doc)
      setSelectedFile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const isPdf = selectedFile?.type === 'application/pdf'

  const dropZoneBorder = selectedFile
    ? '2px dashed var(--mt-success)'
    : dragging
      ? '2px dashed var(--mt-primary)'
      : '2px dashed var(--mt-border-2)'

  const dropZoneBg = selectedFile
    ? 'var(--mt-success-subtle)'
    : dragging
      ? 'var(--mt-primary-subtle)'
      : 'var(--mt-bg)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: dropZoneBorder,
          borderRadius: 12,
          padding: '28px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dropZoneBg,
          transition: 'border-color .2s, background .2s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {selectedFile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {isPdf
              ? <FileText size={28} color="var(--mt-danger)" style={{ flexShrink: 0 }} />
              : <Image size={28} color="var(--mt-primary)" style={{ flexShrink: 0 }} />
            }
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <p style={{ fontWeight: 500, color: 'var(--mt-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.name}
              </p>
              <p style={{ color: 'var(--mt-muted)', fontSize: 12, margin: '2px 0 0' }}>
                {(selectedFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--mt-muted)', display: 'flex',
                padding: 4, borderRadius: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--mt-muted)' }}>
            <Upload size={26} color="var(--mt-muted)" />
            <p style={{ fontWeight: 500, margin: 0, color: 'var(--mt-text-2)' }}>Arrastra un archivo o haz clic</p>
            <p style={{ fontSize: 12, margin: 0 }}>PDF, JPEG, PNG, WEBP — máx. 20MB</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      {selectedFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{
              display: 'block', fontSize: 13, fontWeight: 500,
              color: 'var(--mt-text-2)', marginBottom: 6,
            }}>
              Tipo de documento
            </label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid var(--mt-border)',
                borderRadius: 8, padding: '8px 12px',
                color: 'var(--mt-text)', fontSize: 13,
                background: 'var(--mt-surface)',
                outline: 'none',
                fontFamily: 'var(--mt-font)',
              }}
            >
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={visibleToPatient}
              onChange={e => setVisibleToPatient(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--mt-purple)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>Visible para el paciente en su portal</span>
          </label>
        </div>
      )}

      {error && (
        <p style={{
          fontSize: 13, color: 'var(--mt-danger)',
          background: 'var(--mt-danger-subtle)',
          borderRadius: 8, padding: '8px 12px', margin: 0,
          border: '1px solid #fecaca',
        }}>{error}</p>
      )}

      {selectedFile && (
        <MTButton
          variant="solid"
          size="md"
          icon={uploading ? Loader2 : Upload}
          disabled={uploading}
          onClick={handleUpload}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </MTButton>
      )}
    </div>
  )
}
