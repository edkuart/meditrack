'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  UserRoundSearch,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalPage,
  EmptyClinicalState,
  LoadingState,
  MTAvatar,
  MTInput,
  MTPill,
} from '@/components/doctor/clinical-ui'

const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const diff = Date.now() - new Date(dob).getTime()
  return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365))} a`
}

// ─────────────────────────────────────────────
// Adherence bar
// ─────────────────────────────────────────────
function AdherenceBar({ value }: { value: number | null }) {
  if (value == null) return <span style={{ fontSize: 13, color: 'var(--mt-muted)' }}>—</span>
  const tone = value >= 80 ? '#047857' : value >= 50 ? '#b45309' : '#b91c1c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 64, height: 6, background: 'var(--mt-elevated)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: tone, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: tone, fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
        {value}%
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Patient table row
// ─────────────────────────────────────────────
function PatientRow({ patient, last }: { patient: Patient; last: boolean }) {
  const [hover, setHover] = useState(false)

  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => window.location.href = `/patients/${patient.id}`}
      style={{
        background: hover ? 'var(--mt-elevated)' : 'transparent',
        borderBottom: last ? 'none' : '1px solid var(--mt-border)',
        transition: 'background .2s',
        cursor: 'pointer',
      }}
    >
      {/* Patient */}
      <td style={{ padding: '12px 20px', position: 'relative' }}>
        {hover && (
          <span style={{
            position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
            background: 'var(--mt-primary)', borderRadius: 2,
            animation: 'mt-slide-in-l .2s ease-out',
          }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MTAvatar name={`${patient.first_name} ${patient.last_name}`} size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)' }}>
              {patient.first_name} {patient.last_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--mt-text-2)', marginTop: 2 }}>
              {calcAge(patient.date_of_birth)}
              {patient.sex ? ` · ${SEX_LABELS[patient.sex]}` : ''}
              {patient.id_number ? ` · ${patient.id_number}` : ''}
            </div>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--mt-text-2)' }}>
        {patient.phone ?? '—'}
      </td>

      {/* Status pill */}
      <td style={{ padding: '12px 16px' }}>
        <MTPill tone="green" dot>Activo</MTPill>
      </td>

      {/* Adherence — placeholder since API doesn't return it in list */}
      <td style={{ padding: '12px 16px' }}>
        <AdherenceBar value={null} />
      </td>

      {/* Actions */}
      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--mt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal size={16} />
          </button>
          <ChevronRight
            size={16}
            color={hover ? 'var(--mt-text)' : 'var(--mt-muted)'}
            style={{ transition: 'transform .2s, color .2s', transform: hover ? 'translateX(2px)' : 'none' }}
          />
        </div>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
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

  useEffect(() => { search('', 1) }, [search])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    search(query, 1)
  }

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Cartera clínica"
        title="Pacientes"
        subtitle={
          meta.total > 0
            ? `${meta.total} pacientes registrados`
            : 'Agrega el primer paciente para iniciar seguimiento clínico.'
        }
        icon={Users}
        actions={
          <>
            <ClinicalButton variant="outline" icon={Filter} type="button">Filtros</ClinicalButton>
            <ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton>
          </>
        }
      />

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400 }}>
          <MTInput
            icon={Search}
            placeholder="Buscar por nombre, cédula o teléfono…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState label="Cargando pacientes..." />
      ) : patients.length === 0 ? (
        <EmptyClinicalState
          icon={UserRoundSearch}
          title={query ? 'Sin resultados' : 'No hay pacientes registrados'}
          description={
            query
              ? 'Intenta con otro nombre, teléfono o documento.'
              : 'Agrega el primer paciente para iniciar encounters, tratamientos y seguimiento.'
          }
          action={
            !query && (
              <ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton>
            )
          }
        />
      ) : (
        <div style={{
          background: 'var(--mt-surface)',
          border: '1px solid var(--mt-border)',
          borderRadius: 12,
          boxShadow: 'var(--mt-shadow-sm)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '32%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--mt-bg)', borderBottom: '1px solid var(--mt-border)' }}>
                {['Paciente', 'Teléfono', 'Estado', 'Adherencia', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 16px',
                    textAlign: i === 4 ? 'right' : 'left',
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--mt-muted)',
                  }}>
                    {i === 0 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {h}<ChevronDown size={11} />
                      </span>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => (
                <PatientRow key={p.id} patient={p} last={i === patients.length - 1} />
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{
            padding: '12px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid var(--mt-border)',
            background: 'var(--mt-bg)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--mt-muted)' }}>
              Mostrando {patients.length} de {meta.total} pacientes
            </span>
            {meta.pages > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <ClinicalButton
                  variant="outline"
                  size="sm"
                  icon={ChevronLeft}
                  disabled={page <= 1 || loading}
                  onClick={() => search(query, page - 1)}
                >
                  Anterior
                </ClinicalButton>
                <ClinicalButton
                  variant="outline"
                  size="sm"
                  iconRight={ChevronRight}
                  disabled={page >= meta.pages || loading}
                  onClick={() => search(query, page + 1)}
                >
                  Siguiente
                </ClinicalButton>
              </div>
            )}
          </div>
        </div>
      )}
    </ClinicalPage>
  )
}
