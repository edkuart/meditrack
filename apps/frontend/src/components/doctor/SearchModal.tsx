'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, UserRound, Clock } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'

// ─── Recent patients (persisted in localStorage) ────────────────────────────

const RECENTS_KEY = 'meditrack.recentPatients'
const MAX_RECENTS = 5

type RecentPatient = Pick<Patient, 'id' | 'first_name' | 'last_name' | 'mrn' | 'date_of_birth' | 'sex'> & {
  savedAt?: string
}

function getRecents(): RecentPatient[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as RecentPatient[]) : []
  } catch { return [] }
}

export function saveRecentPatient(p: Omit<RecentPatient, 'savedAt'>) {
  try {
    const prev = getRecents().filter(r => r.id !== p.id)
    localStorage.setItem(RECENTS_KEY, JSON.stringify([{ ...p, savedAt: new Date().toISOString() }, ...prev].slice(0, MAX_RECENTS)))
  } catch { /* ignore */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function ageFromDob(dob: string | null): string | null {
  if (!dob) return null
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000))}a`
}

function relativeTime(iso: string | undefined): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora mismo'
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function PatientRow({
  patient,
  isSelected,
  onSelect,
  onHover,
  showRecent,
}: {
  patient: RecentPatient
  isSelected: boolean
  onSelect: () => void
  onHover?: () => void
  showRecent?: boolean
}) {
  const age = ageFromDob(patient.date_of_birth)
  const sex = patient.sex === 'male' ? 'M' : patient.sex === 'female' ? 'F' : null
  const when = showRecent ? relativeTime(patient.savedAt) : null

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px',
        minHeight: 56,
        background: isSelected ? 'var(--mt-primary-subtle)' : 'transparent',
        transition: 'background .1s',
        fontFamily: 'var(--mt-font)',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: isSelected ? 'rgba(37,99,235,.15)' : 'var(--mt-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showRecent
          ? <Clock size={16} color={isSelected ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
          : <UserRound size={16} color={isSelected ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, lineHeight: 1.2,
          color: isSelected ? 'var(--mt-primary)' : 'var(--mt-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {patient.first_name} {patient.last_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
          {patient.mrn && (
            <span style={{ fontFamily: 'var(--mt-font-mono)', color: 'var(--mt-primary)', fontWeight: 600 }}>
              {patient.mrn}
            </span>
          )}
          {patient.mrn && (age || sex) && (
            <span style={{ color: 'var(--mt-border)' }}>·</span>
          )}
          {age && <span>{age}</span>}
          {sex && <span>{sex}</span>}
        </div>
      </div>
      {when && (
        <span style={{
          fontSize: 11, color: 'var(--mt-muted)', flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {when}
        </span>
      )}
    </button>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SearchModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [recents, setRecents] = useState<RecentPatient[]>([])
  const [isMobile, setIsMobile] = useState(false)

  const debouncedQuery = useDebounce(query, 220)

  // Detect mobile on mount
  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 767px)').matches)
  }, [])

  // Load recents & focus input
  useEffect(() => {
    setRecents(getRecents())
    inputRef.current?.focus()
  }, [])

  // Keyboard: Escape closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const search = useCallback(async (q: string) => {
    if (!token || q.trim().length < 1) { setResults([]); return }
    setLoading(true)
    try {
      const res = await listPatients(token, q.trim(), 1, 8)
      setResults(res.patients)
      setSelected(0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void search(debouncedQuery) }, [debouncedQuery, search])

  function navigate(patient: RecentPatient) {
    saveRecentPatient(patient)
    router.push(`/patients/${patient.id}`)
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const list = debouncedQuery ? results : recents
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, list.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && list[selected]) navigate(list[selected])
  }

  const showRecents = !debouncedQuery && recents.length > 0
  const showResults = !!debouncedQuery && results.length > 0
  const showEmpty   = !!debouncedQuery && !loading && results.length === 0

  // Mobile: full-screen from below topbar
  // Desktop: centered card below topbar
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 201,
        background: 'var(--mt-surface)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'mt-slide-down .2s ease-out',
        borderTop: '1px solid var(--mt-border)',
      }
    : {
        position: 'fixed',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 201,
        width: '100%',
        maxWidth: 520,
        background: 'var(--mt-surface)',
        border: '1px solid var(--mt-border)',
        borderRadius: 14,
        boxShadow: '0 20px 60px rgba(15,23,42,.25)',
        overflow: 'hidden',
        animation: 'mt-slide-down .2s ease-out',
      }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(15,23,42,.45)',
          backdropFilter: 'blur(3px)',
          animation: 'mt-fade-in .2s ease-out',
        }}
      />

      <div style={panelStyle}>
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: isMobile ? '14px 16px' : '12px 16px',
          borderBottom: (showRecents || showResults || loading || showEmpty)
            ? '1px solid var(--mt-border)'
            : 'none',
          flexShrink: 0,
        }}>
          {loading
            ? <Loader2 size={18} color="var(--mt-primary)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : <Search size={18} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar por nombre, MRN o DPI…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: isMobile ? 16 : 15,
              color: 'var(--mt-text)',
              background: 'transparent',
              fontFamily: 'var(--mt-font)',
            }}
          />
          {/* Clear query */}
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--mt-elevated)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--mt-muted)', flexShrink: 0,
              }}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
          {/* Close — always visible on mobile */}
          {isMobile && (
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'var(--mt-elevated)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--mt-text-2)', flexShrink: 0, marginLeft: 4,
              }}
              aria-label="Cerrar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Scrollable results area */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="mt-scroll">
          {/* Recent patients (empty query) */}
          {showRecents && (
            <>
              <div style={{
                padding: '9px 18px 5px',
                fontSize: 11, fontWeight: 700, color: 'var(--mt-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Vistos recientemente
              </div>
              {recents.map((p, i) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  isSelected={i === selected}
                  onSelect={() => navigate(p)}
                  onHover={() => setSelected(i)}
                  showRecent
                />
              ))}
            </>
          )}

          {/* Search results */}
          {showResults && (
            <>
              {results.map((p, i) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  isSelected={i === selected}
                  onSelect={() => navigate(p)}
                  onHover={() => setSelected(i)}
                />
              ))}
            </>
          )}

          {/* Empty search result */}
          {showEmpty && (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--mt-muted)', fontSize: 13.5 }}>
              Sin resultados para &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {/* Idle state: no query, no recents */}
          {!debouncedQuery && recents.length === 0 && (
            <div style={{
              padding: isMobile ? '40px 24px' : '20px 18px',
              textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'var(--mt-primary-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Search size={22} color="var(--mt-primary)" />
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--mt-text)' }}>
                Busca un paciente
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mt-muted)', lineHeight: 1.5 }}>
                Escribe el nombre, MRN o número de documento
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
