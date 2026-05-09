'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Plus, Users, ChevronRight, ChevronLeft, UserRoundSearch } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalPage,
  EmptyClinicalState,
  LoadingState,
  StatusPill,
} from '@/components/doctor/clinical-ui'

const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

export default function PatientsPage() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)

  const search = useCallback(async (q: string, nextPage = 1) => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listPatients(token, q || undefined, nextPage)
      setPatients(data.patients)
      setMeta(data.meta)
      setPage(data.meta.page)
    } catch {
      setPatients([])
      setMeta({ page: 1, limit: 20, total: 0, pages: 1 })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    search('', 1)
  }, [search])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    search(query, 1)
  }

  function goToPage(nextPage: number) {
    search(query, nextPage)
  }

  function calcAge(dob: string | null): string {
    if (!dob) return '—'
    const diff = Date.now() - new Date(dob).getTime()
    return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365))} años`
  }

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Directorio clínico"
        title="Pacientes"
        subtitle="Busca, filtra y abre rápidamente el expediente clínico del paciente antes de iniciar seguimiento."
        icon={Users}
        actions={
          <ClinicalButton href="/patients/new" icon={Plus}>
          Nuevo paciente
          </ClinicalButton>
        }
      />

      <form onSubmit={handleSearch} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o cédula..."
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button type="submit" className="sr-only">Buscar</button>
        </div>
      </form>

      {!loading && meta.total > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-400">
          <span>{meta.total} pacientes</span>
          <span>Página {meta.page} de {Math.max(meta.pages, 1)}</span>
        </div>
      )}

      {loading ? (
        <LoadingState label="Cargando pacientes..." />
      ) : patients.length === 0 ? (
        <EmptyClinicalState
          icon={UserRoundSearch}
          title={query ? 'Sin resultados' : 'No hay pacientes registrados'}
          description={query ? 'Intenta con otro nombre, teléfono o documento.' : 'Agrega el primer paciente para iniciar encounters, tratamientos y seguimiento.'}
          action={!query && <ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {patients.map(p => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="group flex items-center gap-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-600">
                {p.first_name[0]}{p.last_name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-800 text-sm">{p.first_name} {p.last_name}</p>
                  {p.sex && <StatusPill tone="slate">{SEX_LABELS[p.sex]}</StatusPill>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                  {p.date_of_birth && <span>{calcAge(p.date_of_birth)}</span>}
                  {p.id_number && <span>CI: {p.id_number}</span>}
                  {p.phone && <span>{p.phone}</span>}
                </div>
              </div>

              <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
            </Link>
          ))}
          {meta.pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={15} />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= meta.pages || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </ClinicalPage>
  )
}
