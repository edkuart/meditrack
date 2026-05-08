'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { DocumentUploader } from '@/components/doctor/DocumentUploader'
import { DocumentList } from '@/components/doctor/DocumentList'
import { listDocuments, type Document } from '@/lib/doctor/api'

// Minimal session helper — in a real app this would use a proper auth context
function getDoctorToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('meditrack_doctor_token')
}

export default function PatientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [showUploader, setShowUploader] = useState(false)

  useEffect(() => {
    const t = getDoctorToken()
    if (!t) { router.replace('/login'); return }
    setToken(t)
  }, [router])

  const loadDocuments = useCallback(async (t: string) => {
    setLoadingDocs(true)
    try {
      const docs = await listDocuments(t, patientId)
      setDocuments(docs)
    } catch {
      // silent — show empty state
    } finally {
      setLoadingDocs(false)
    }
  }, [patientId])

  useEffect(() => {
    if (token) loadDocuments(token)
  }, [token, loadDocuments])

  function handleUploaded(doc: Document) {
    setDocuments(prev => [doc, ...prev])
    setShowUploader(false)
  }

  function handleDeleted(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  function handleVisibilityChanged(id: string, visible: boolean) {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, is_visible_to_patient: visible } : d))
  }

  if (!token) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Documents section */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-slate-500" />
            <h2 className="font-semibold text-slate-800">Documentos</h2>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              {documents.length}
            </span>
          </div>
          <button
            onClick={() => setShowUploader(v => !v)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showUploader ? (
              <><ChevronUp size={16} /> Cancelar</>
            ) : (
              <><Plus size={16} /> Subir</>
            )}
          </button>
        </div>

        {showUploader && (
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <DocumentUploader
              token={token}
              patientId={patientId}
              onUploaded={handleUploaded}
            />
          </div>
        )}

        <div className="px-5 py-4">
          {loadingDocs ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <DocumentList
              token={token}
              documents={documents}
              onDeleted={handleDeleted}
              onVisibilityChanged={handleVisibilityChanged}
            />
          )}
        </div>
      </section>
    </div>
  )
}
