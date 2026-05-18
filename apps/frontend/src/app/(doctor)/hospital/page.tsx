'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BedDouble, RefreshCw, AlertTriangle, Loader2, LogOut,
  Building2, TrendingUp, Clock, Users, Lock, ArrowRight,
  LayoutGrid, List, CheckCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getHospitalCensus, dischargePatient,
  type Admission,
} from '@/lib/doctor/api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, ClinicalPanel,
  EmptyClinicalState, LoadingState, StatusPill,
} from '@/components/doctor/clinical-ui'

function daysSince(isoDate: string) {
  return Math.ceil((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

// ─── Premium gate ─────────────────────────────────────────────────────────────

function PremiumGate() {
  return (
    <div style={{
      maxWidth: 520, margin: '40px auto 0',
      border: '1px solid var(--mt-border)', borderRadius: 16,
      background: 'var(--mt-surface)',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(15,23,42,.06)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
        padding: '28px 32px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'rgba(255,255,255,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Building2 size={24} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.7)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Módulo Premium
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
            Gestión Hospitalaria
          </div>
        </div>
      </div>

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: BedDouble,    text: 'Censo hospitalario en tiempo real por sala y departamento' },
            { icon: Users,        text: 'Gestión de internamientos, altas y derivaciones integradas' },
            { icon: TrendingUp,   text: 'Métricas de ocupación, estancia promedio y rotación de camas' },
            { icon: Building2,    text: 'Estructura multi-departamento con roles especializados' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--mt-primary-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={15} color="var(--mt-primary)" />
              </div>
              <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>{text}</span>
            </div>
          ))}
        </div>

        <div style={{
          background: 'var(--mt-elevated)', borderRadius: 10,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Lock size={14} color="var(--mt-muted)" />
          <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>
            Disponible solo para instituciones con plan Hospital activo.
          </span>
        </div>

        <Link
          href="/settings/hospital"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'var(--mt-primary)', color: '#fff', borderRadius: 10,
            padding: '12px 20px', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', transition: 'opacity .15s',
          }}
        >
          Activar módulo hospital
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ admissions }: { admissions: Admission[] }) {
  const active = admissions.filter(a => a.status === 'ACTIVE')
  const avgDays = active.length === 0 ? 0 : Math.round(
    active.reduce((sum, a) => sum + daysSince(a.admitted_at), 0) / active.length
  )
  const longStay = active.filter(a => daysSince(a.admitted_at) >= 7).length
  const depts = new Set(active.map(a => a.department_id ?? '__none__')).size

  const stats = [
    { label: 'Internados',      value: active.length,  icon: BedDouble,   color: '#2563eb', bg: '#dbeafe' },
    { label: 'Departamentos',   value: depts,           icon: Building2,   color: '#0891b2', bg: '#cffafe' },
    { label: 'Estancia media',  value: `${avgDays}d`,   icon: Clock,       color: '#7c3aed', bg: '#ede9fe' },
    { label: 'Estancia larga',  value: longStay,        icon: AlertTriangle, color: '#d97706', bg: '#fef3c7' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }} className="sm:grid-cols-4">
      {stats.map(s => {
        const Icon = s.icon
        return (
          <div key={s.label} style={{
            background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
            borderRadius: 12, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: s.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={17} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', lineHeight: 1.1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 1 }}>
                {s.label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Discharge inline ─────────────────────────────────────────────────────────

function DischargeInline({
  admissionId,
  onDone,
  onCancel,
}: { admissionId: string; onDone: (id: string) => void; onCancel: () => void }) {
  const { token } = useAuth()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      await dischargePatient(token, admissionId, { discharge_notes: notes.trim() || undefined })
      onDone(admissionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al dar de alta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        placeholder="Notas de alta (opcional)…"
        style={{
          border: '1px solid var(--mt-border)', borderRadius: 8,
          padding: '6px 10px', fontSize: 12, resize: 'none',
          color: 'var(--mt-text)', background: 'var(--mt-surface)',
          fontFamily: 'var(--mt-font)', outline: 'none',
        }}
      />
      {error && <p style={{ fontSize: 11, color: 'var(--mt-danger)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={submit}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 500, color: '#16a34a',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
          Confirmar alta
        </button>
        <button
          onClick={onCancel}
          style={{ fontSize: 12, color: 'var(--mt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Admission row ────────────────────────────────────────────────────────────

function AdmissionRow({
  adm,
  onDischarged,
}: { adm: Admission; onDischarged: (id: string) => void }) {
  const [discharging, setDischarging] = useState(false)
  const days = daysSince(adm.admitted_at)
  const isLong = days >= 7

  return (
    <div style={{ padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {adm.patient ? (
              <Link
                href={`/patients/${adm.patient_id}`}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', textDecoration: 'none' }}
                className="hover:text-blue-600 transition-colors"
              >
                {adm.patient.first_name} {adm.patient.last_name}
              </Link>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>Paciente</span>
            )}
            {adm.patient?.mrn && (
              <span style={{ fontFamily: 'var(--mt-font-mono)', fontSize: 11, color: '#2563eb' }}>
                {adm.patient.mrn}
              </span>
            )}
            {adm.bed_code && (
              <span style={{
                fontFamily: 'var(--mt-font-mono)', fontSize: 11,
                background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
                padding: '1px 7px', borderRadius: 5,
              }}>
                {adm.bed_code}
              </span>
            )}
            <StatusPill tone={isLong ? 'amber' : 'blue'}>
              {days} día{days !== 1 ? 's' : ''}
            </StatusPill>
            {adm.referral && (
              <StatusPill tone="purple">Derivación</StatusPill>
            )}
          </div>

          {adm.admission_notes && (
            <p style={{ fontSize: 12, color: 'var(--mt-text-2)', margin: 0 }} className="line-clamp-1">
              {adm.admission_notes}
            </p>
          )}

          <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>
            Ingreso: {new Date(adm.admitted_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {adm.admitted_by_doctor && ` · Dr. ${adm.admitted_by_doctor.first_name} ${adm.admitted_by_doctor.last_name}`}
          </p>
        </div>

        <div style={{ flexShrink: 0 }}>
          {discharging ? (
            <DischargeInline
              admissionId={adm.id}
              onDone={id => { onDischarged(id); setDischarging(false) }}
              onCancel={() => setDischarging(false)}
            />
          ) : (
            <button
              onClick={() => setDischarging(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                borderRadius: 6, transition: 'all .15s',
              }}
              className="hover:text-blue-700"
            >
              <LogOut size={13} /> Dar de alta
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Department view ──────────────────────────────────────────────────────────

type ViewMode = 'list' | 'departments'

function DeptGrid({
  byDept,
  onDischarged,
}: {
  byDept: Record<string, { name: string; items: Admission[] }>
  onDischarged: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 16 }} className="sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(byDept).map(([key, group]) => (
        <div key={key} style={{
          border: '1px solid var(--mt-border)', borderRadius: 12,
          background: 'var(--mt-surface)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--mt-border)',
            background: 'var(--mt-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} color="var(--mt-muted)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>
                {group.name}
              </span>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600,
              background: '#dbeafe', color: '#1d4ed8',
              padding: '2px 8px', borderRadius: 999,
            }}>
              {group.items.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {group.items.map((adm, i) => {
              const days = daysSince(adm.admitted_at)
              return (
                <div key={adm.id} style={{
                  padding: '10px 16px',
                  borderTop: i > 0 ? '1px solid var(--mt-border)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    {adm.patient ? (
                      <Link
                        href={`/patients/${adm.patient_id}`}
                        style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt-text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {adm.patient.first_name} {adm.patient.last_name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--mt-text)' }}>Paciente</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {adm.bed_code && (
                        <span style={{ fontFamily: 'var(--mt-font-mono)', fontSize: 10, color: 'var(--mt-muted)' }}>
                          {adm.bed_code}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: days >= 7 ? '#d97706' : 'var(--mt-muted)' }}>
                        {days}d
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/patients/${adm.patient_id}?openTab=admissions`}
                    style={{
                      fontSize: 11, color: 'var(--mt-primary)', textDecoration: 'none',
                      flexShrink: 0, fontWeight: 500,
                    }}
                  >
                    Ver
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HospitalPage() {
  const { token, user } = useAuth()
  const [admissions, setAdmissions] = useState<Admission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('list')

  const isHospital = user?.tenant_type === 'HOSPITAL'

  const load = useCallback(async () => {
    if (!token || !isHospital) return
    setLoading(true)
    setError(null)
    try {
      const data = await getHospitalCensus(token)
      setAdmissions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando censo')
    } finally {
      setLoading(false)
    }
  }, [token, isHospital])

  useEffect(() => { load() }, [load])

  const active = admissions.filter(a => a.status === 'ACTIVE')

  const byDept = active.reduce<Record<string, { name: string; items: Admission[] }>>((acc, adm) => {
    const key = adm.department_id ?? '__none__'
    const name = adm.department?.name ?? 'Sin departamento'
    if (!acc[key]) acc[key] = { name, items: [] }
    acc[key].items.push(adm)
    return acc
  }, {})

  function handleDischarged(id: string) {
    setAdmissions(prev => prev.map(a => a.id === id ? { ...a, status: 'DISCHARGED' as const } : a))
  }

  return (
    <ClinicalPage>
      <ClinicalHeader
        title="Hospital"
        subtitle="Censo y gestión de pacientes internados"
        icon={BedDouble}
        actions={
          isHospital ? (
            <ClinicalButton icon={RefreshCw} variant="outline" tone="slate" onClick={load}>
              Actualizar
            </ClinicalButton>
          ) : undefined
        }
      />

      {!isHospital ? (
        <PremiumGate />
      ) : loading ? (
        <LoadingState label="Cargando censo hospitalario…" />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm text-slate-500">{error}</p>
          <ClinicalButton variant="outline" tone="slate" onClick={load}>Reintentar</ClinicalButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Stats */}
          <StatsRow admissions={active} />

          {/* View toggle + content */}
          {active.length === 0 ? (
            <EmptyClinicalState
              icon={BedDouble}
              title="Sin pacientes internados"
              description="Cuando internes un paciente desde su expediente clínico, aparecerá aquí."
            />
          ) : (
            <>
              {/* View mode toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)' }}>
                  {active.length} paciente{active.length !== 1 ? 's' : ''} internado{active.length !== 1 ? 's' : ''}
                </span>
                <div style={{
                  display: 'flex', gap: 2,
                  background: 'var(--mt-elevated)', borderRadius: 8, padding: 2,
                }}>
                  {([
                    { key: 'list' as ViewMode,        icon: List,        label: 'Lista' },
                    { key: 'departments' as ViewMode, icon: LayoutGrid,  label: 'Por departamento' },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setView(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 6, border: 'none',
                        background: view === key ? 'var(--mt-surface)' : 'transparent',
                        color: view === key ? 'var(--mt-text)' : 'var(--mt-muted)',
                        fontSize: 12, fontWeight: view === key ? 500 : 400,
                        cursor: 'pointer', transition: 'all .15s',
                        boxShadow: view === key ? '0 1px 3px rgba(15,23,42,.08)' : 'none',
                      }}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {view === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(byDept).map(([key, group]) => (
                    <ClinicalPanel key={key} title={group.name} icon={Building2} collapsible defaultOpen>
                      <div style={{ borderTop: '1px solid var(--mt-border)' }}>
                        {group.items.map((adm, i) => (
                          <div key={adm.id} style={i > 0 ? { borderTop: '1px solid var(--mt-border)' } : {}}>
                            <AdmissionRow adm={adm} onDischarged={handleDischarged} />
                          </div>
                        ))}
                      </div>
                    </ClinicalPanel>
                  ))}
                </div>
              )}

              {view === 'departments' && (
                <DeptGrid byDept={byDept} onDischarged={handleDischarged} />
              )}
            </>
          )}
        </div>
      )}
    </ClinicalPage>
  )
}
