'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, UserRound } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'

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
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000))
  return `${years}a`
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const debouncedQuery = useDebounce(query, 220)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Close on Escape
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

  function navigate(patient: Patient) {
    router.push(`/patients/${patient.id}`)
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) navigate(results[selected])
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
          animation: 'mt-fade-in .15s ease-out',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
        zIndex: 201, width: '100%', maxWidth: 520,
        background: 'var(--mt-surface)',
        border: '1px solid var(--mt-border)',
        borderRadius: 14,
        boxShadow: '0 20px 60px rgba(15,23,42,.25)',
        overflow: 'hidden',
        animation: 'mt-slide-down .18s ease-out',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: results.length > 0 || loading ? '1px solid var(--mt-border)' : 'none',
        }}>
          {loading
            ? <Loader2 size={17} color="var(--mt-primary)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : <Search size={17} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar por nombre, MRN o documento…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--mt-text)',
              background: 'transparent',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ color: 'var(--mt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: 360, overflowY: 'auto' }} className="mt-scroll">
            {results.map((p, i) => {
              const age = ageFromDob(p.date_of_birth)
              const sex = p.sex === 'male' ? 'M' : p.sex === 'female' ? 'F' : null
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(p)}
                  onMouseEnter={() => setSelected(i)}
                  style={{
                    width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    background: i === selected ? 'var(--mt-primary-subtle)' : 'transparent',
                    transition: 'background .1s',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: i === selected ? 'rgba(26,86,219,.15)' : 'var(--mt-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <UserRound size={16} color={i === selected ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: i === selected ? 'var(--mt-primary)' : 'var(--mt-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.first_name} {p.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--mt-muted)', display: 'flex', gap: 8 }}>
                      {p.mrn && <span style={{ fontFamily: 'var(--mt-font-mono)', color: 'var(--mt-primary)' }}>{p.mrn}</span>}
                      {age && <span>{age}</span>}
                      {sex && <span>{sex}</span>}
                      {p.id_number && <span>CI: {p.id_number}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {query.length > 0 && !loading && results.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--mt-muted)', fontSize: 13 }}>
            Sin resultados para &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Hint */}
        {query.length === 0 && (
          <div style={{ padding: '12px 16px', color: 'var(--mt-muted)', fontSize: 12, display: 'flex', gap: 16 }}>
            <span><kbd style={{ fontSize: 10, fontFamily: 'var(--mt-font-mono)', padding: '1px 5px', background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)', borderRadius: 4 }}>↑↓</kbd> navegar</span>
            <span><kbd style={{ fontSize: 10, fontFamily: 'var(--mt-font-mono)', padding: '1px 5px', background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)', borderRadius: 4 }}>Enter</kbd> abrir</span>
            <span><kbd style={{ fontSize: 10, fontFamily: 'var(--mt-font-mono)', padding: '1px 5px', background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)', borderRadius: 4 }}>Esc</kbd> cerrar</span>
          </div>
        )}
      </div>
    </>
  )
}
