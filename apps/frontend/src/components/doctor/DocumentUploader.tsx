'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Image, Loader2 } from 'lucide-react'
import { uploadDocument, type Document } from '@/lib/doctor/api'

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

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}
          ${selectedFile ? 'border-green-300 bg-green-50' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            {isPdf
              ? <FileText size={28} className="text-red-500 shrink-0" />
              : <Image size={28} className="text-blue-500 shrink-0" />
            }
            <div className="text-left min-w-0">
              <p className="font-medium text-slate-800 truncate">{selectedFile.name}</p>
              <p className="text-slate-400 text-sm">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Upload size={28} />
            <p className="font-medium">Arrastra un archivo o haz clic</p>
            <p className="text-sm">PDF, JPEG, PNG, WEBP — máx. 20MB</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      {selectedFile && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Tipo de documento
            </label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visibleToPatient}
              onChange={e => setVisibleToPatient(e.target.checked)}
              className="w-4 h-4 rounded text-blue-500"
            />
            <span className="text-sm text-slate-600">Visible para el paciente en su portal</span>
          </label>
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {selectedFile && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors"
        >
          {uploading ? (
            <><Loader2 size={16} className="animate-spin" /> Subiendo...</>
          ) : (
            <><Upload size={16} /> Subir documento</>
          )}
        </button>
      )}
    </div>
  )
}
