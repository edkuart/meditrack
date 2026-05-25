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

const TYPE_CONFIG: Record<string, {
  label: string
  color: string
  bg: string
  icon: React.ElementType
}> = {
  PRESCRIPTION:  { label: 'Receta',            color: 'var(--mt-primary)',       bg: 'var(--mt-primary-subtle)',  icon: Pill          },
  LAB_RESULT:    { label: 'Análisis de lab',    color: 'var(--mt-success)',       bg: 'var(--mt-success-subtle)', icon: FlaskConical  },
  IMAGING:       { label: 'Imagen diagnóstica', color: '#7C3AED',                 bg: '#F5F3FF',                  icon: Scan          },
  CONSENT:       { label: 'Consentimiento',     color: '#D97706',                 bg: '#FFFBEB',                  icon: FileSignature },
  CLINICAL_NOTE: { label: 'Nota clínica',       color: 'var(--mt-text-2)',        bg: 'var(--mt-elevated)',       icon: ClipboardList },
  OTHER:         { label: 'Documento',          color: 'var(--mt-muted)',         bg: 'var(--mt-elevated)',       icon: FileText      },
}

function getTypeCfg(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.OTHER
}

const FILTERS = [
  { value: '',               label: 'Todos'           },
  { value: 'PRESCRIPTION',  label: 'Recetas'          },
  { value: 'LAB_RESULT',    label: 'Análisis'         },
  { value: 'IMAGING',       label: 'Imágenes'         },
  { value: 'CLINICAL_NOTE', label: 'Notas'            },
  { value: 'CONSENT',       label: 'Consentimientos'  },
]

function FilterChip({ label, active, count, onClick }: {
  label: string; active: boolean; count?: number; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
        fontSize: 12.5, fontWeight: active ? 700 : 500,
        background: active ? 'var(--mt-text)' : hov ? 'var(--mt-border)' : 'var(--mt-elevated)',
        color: active ? '#fff' : 'var(--mt-text-2)',
        transition: 'background .15s, color .15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--mt-font)',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: 11, fontWeight: 700, opacity: 0.65,
          background: active ? 'rgba(255,255,255,.2)' : 'transparent',
          padding: active ? '1px 5px' : undefined, borderRadius: 999,
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

function DocRow({ doc, token }: { doc: PatientDocument; token: string }) {
  const [loading, setLoading] = useState(false)
  const [hov, setHov] = useState(false)
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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 16,
      border: '1px solid var(--mt-border)',
      background: 'var(--mt-surface)',
      boxShadow: 'var(--mt-shadow-sm)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: cfg.bg, color: cfg.color,
      }}>
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.file_name}
        </p>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          <span style={{ color: 'var(--mt-border)', fontSize: 12 }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
            {new Date(doc.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <button
        onClick={handleOpen}
        disabled={loading}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title="Abrir documento"
        style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hov ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
          color: hov ? 'var(--mt-primary)' : 'var(--mt-muted)',
          opacity: loading ? 0.5 : 1,
          transition: 'background .15s, color .15s',
        }}
      >
        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
      </button>
    </div>
  )
}

export default function DocumentsPage() {
  const router = useRouter()
  const [docs, setDocs]       = useState<PatientDocument[]>([])
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')

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

  const availableFilters = FILTERS.filter(
    f => f.value === '' || docs.some(d => d.type === f.value),
  )

  if (loading) {
    return (
      <div className="portal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '4px solid var(--mt-primary-mist)',
          borderTopColor: 'var(--mt-primary)',
          animation: 'spin 1s linear infinite',
        }} />
      </div>
    )
  }

  return (
    <div className="portal-body mt-page-in">
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 18px' }}>
          <Link
            href="/portal"
            aria-label="Volver"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 999,
              background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
              boxShadow: 'var(--mt-shadow-xs)', color: 'var(--mt-text-2)', flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)', lineHeight: 1.15 }}>
              Mis documentos
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, color: 'var(--mt-muted)' }}>
              Lo que tu médico ha compartido contigo
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {docs.length === 0 ? (
            <>
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{
                  margin: '0 auto 14px', width: 56, height: 56, borderRadius: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--mt-elevated)', color: 'var(--mt-muted)',
                }}>
                  <FolderOpen size={26} />
                </div>
                <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--mt-text)' }}>
                  Sin documentos aún
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--mt-muted)', lineHeight: 1.5, padding: '0 16px' }}>
                  Aquí aparecerán recetas, notas clínicas e imágenes diagnósticas que tu médico decida compartir contigo.
                </p>
              </div>

              <div style={{
                borderRadius: 14, border: '1px solid var(--mt-border)',
                background: 'var(--mt-elevated)', padding: '12px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <FlaskConical size={16} style={{ color: 'var(--mt-primary)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--mt-text)' }}>
                    ¿Buscas tus análisis de laboratorio?
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--mt-text-2)' }}>
                    Los resultados de exámenes están en la sección{' '}
                    <Link href="/portal/lab" style={{ color: 'var(--mt-primary)', fontWeight: 600 }}>Lab</Link>.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {availableFilters.length > 2 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {availableFilters.map(f => (
                    <FilterChip
                      key={f.value}
                      label={f.label}
                      active={filter === f.value}
                      count={f.value ? docs.filter(d => d.type === f.value).length : undefined}
                      onClick={() => setFilter(f.value)}
                    />
                  ))}
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>
                {visible.length} documento{visible.length !== 1 ? 's' : ''}
                {filter ? ` · ${getTypeCfg(filter).label}` : ''}
              </p>

              {token && visible.map(doc => (
                <DocRow key={doc.id} doc={doc} token={token} />
              ))}

              {visible.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13.5, color: 'var(--mt-muted)' }}>
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
