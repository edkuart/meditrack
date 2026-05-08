'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Plus, Users, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'

const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

export default function PatientsPage() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)

  const search = useCallback(async (q: string) => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listPatients(token, q || undefined)
      setPatients(data)
    } catch {
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    search('')
  }, [search])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    search(query)
  }

  function calcAge(dob: string | null): string {
    if (!dob) return '—'
    const diff = Date.now() - new Date(dob).getTime()
    return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365))} años`
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Pacientes</h1>
        <Link
          href="/patients/new"
          className="flex items-center gap-1.5 bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={15} />
          Nuevo paciente
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        />
        <button type="submit" className="sr-only">Buscar</button>
      </form>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : patients.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay pacientes</p>
          <p className="text-sm mt-1">
            {query ? 'Intenta con otro nombre' : 'Agrega tu primer paciente'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {patients.map(p => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-blue-600 font-semibold text-sm">
                {p.first_name[0]}{p.last_name[0]}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm">
                  {p.first_name} {p.last_name}
                  {p.sex && (
                    <span className="ml-2 text-xs text-slate-400">{SEX_LABELS[p.sex]}</span>
                  )}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                  {p.date_of_birth && <span>{calcAge(p.date_of_birth)}</span>}
                  {p.id_number && <span>CI: {p.id_number}</span>}
                  {p.phone && <span>{p.phone}</span>}
                </div>
              </div>

              <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
