'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, Users, Building2, Clock, CheckCircle2,
  XCircle, LogOut, ChevronRight, Loader2, AlertTriangle,
} from 'lucide-react'
import {
  getAdminToken, clearAdminSession,
  fetchMetrics, fetchUsers, verifyDoctor, rejectDoctor, fetchTenants, updateTenant,
  type PendingDoctor, type Tenant, type AdminMetrics,
} from '@/lib/admin/admin-api'

type Tab = 'pending' | 'tenants'

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ElementType; accent: string
}) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 12, padding: '20px 22px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: accent + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} color={accent} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function DoctorRow({ doctor, onVerify, onReject }: {
  doctor: PendingDoctor
  onVerify: (id: string) => void
  onReject: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const isRejected = !!doctor.verification_rejected_at

  async function handleVerify() {
    setBusy(true)
    try { await verifyDoctor(doctor.id); onVerify(doctor.id) } finally { setBusy(false) }
  }

  async function handleReject() {
    const reason = window.prompt('Razón del rechazo (mínimo 10 caracteres):')
    if (!reason || reason.length < 10) return
    setBusy(true)
    try { await rejectDoctor(doctor.id, reason); onReject(doctor.id) } finally { setBusy(false) }
  }

  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            Dr. {doctor.first_name} {doctor.last_name}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{doctor.email}</div>
        </div>
        {isRejected
          ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(239,68,68,.15)', color: '#f87171', fontWeight: 500, flexShrink: 0 }}>Rechazado</span>
          : <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(251,191,36,.12)', color: '#fbbf24', fontWeight: 500, flexShrink: 0 }}>Pendiente</span>
        }
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { l: 'Colegiado', v: doctor.colegiado_number },
          { l: 'Especialidad', v: doctor.specialty },
          { l: 'Cédula', v: doctor.professional_id },
          { l: 'Clínica', v: doctor.tenant?.name },
        ].map(item => item.v && (
          <div key={item.l}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{item.l}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1 }}>{item.v}</div>
          </div>
        ))}
      </div>

      {doctor.dpi_document_key && (
        <div style={{ fontSize: 12, color: '#60a5fa' }}>
          DPI adjunto: <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{doctor.dpi_document_key.slice(0, 32)}…</span>
        </div>
      )}

      {isRejected && doctor.verification_rejected_reason && (
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f87171',
        }}>
          Razón: {doctor.verification_rejected_reason}
        </div>
      )}

      {!isRejected && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleVerify}
            disabled={busy}
            style={{
              flex: 1, height: 36, borderRadius: 8, border: 'none',
              background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
            Aprobar
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            style={{
              flex: 1, height: 36, borderRadius: 8,
              border: '1px solid rgba(239,68,68,.4)', background: 'transparent',
              color: '#f87171', fontSize: 13, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <XCircle size={14} />
            Rechazar
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#334155' }}>
        Registrado: {new Date(doctor.created_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('pending')
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [doctors, setDoctors] = useState<PendingDoctor[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  const token = getAdminToken()

  useEffect(() => {
    if (!token) { router.replace('/admin/login'); return }
  }, [token, router])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [m, u, t] = await Promise.all([
        fetchMetrics(),
        fetchUsers('pending'),
        fetchTenants(),
      ])
      setMetrics(m.data)
      setDoctors(u.data)
      setTenants(t.data)
    } catch {
      clearAdminSession()
      router.replace('/admin/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  function handleLogout() {
    clearAdminSession()
    router.replace('/admin/login')
  }

  function removeDoctor(id: string) {
    setDoctors(prev => prev.filter(d => d.id !== id))
    if (metrics) setMetrics({ ...metrics, doctors: { ...metrics.doctors, pending_verification: Math.max(0, metrics.doctors.pending_verification - 1) } })
  }

  async function handleTenantStatus(id: string, status: 'active' | 'suspended') {
    await updateTenant(id, { status })
    setTenants(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', fontFamily: 'var(--mt-font)', color: '#f1f5f9' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1e293b', padding: '0 clamp(16px, 4vw, 40px)',
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: '#0f172a', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={18} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Meditrack Admin</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid #334155',
            borderRadius: 8, padding: '6px 12px', fontSize: 13,
            color: '#94a3b8', cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          Salir
        </button>
      </header>

      <main style={{ padding: 'clamp(16px, 4vw, 40px)', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={28} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
              <StatCard label="Doctores registrados" value={metrics?.doctors.total ?? 0} icon={Users} accent="#60a5fa" />
              <StatCard label="Pendientes de verificación" value={metrics?.doctors.pending_verification ?? 0} icon={Clock} accent="#fbbf24" />
              <StatCard label="Tenants totales" value={metrics?.tenants.total ?? 0} icon={Building2} accent="#a78bfa" />
              <StatCard label="Tenants activos" value={metrics?.tenants.active ?? 0} icon={CheckCircle2} accent="#34d399" />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
              {[
                { key: 'pending' as Tab, label: 'Doctores pendientes', badge: metrics?.doctors.pending_verification },
                { key: 'tenants' as Tab, label: 'Tenants' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 500,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === t.key ? '#60a5fa' : '#64748b',
                    borderBottom: tab === t.key ? '2px solid #60a5fa' : '2px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'color .15s',
                  }}
                >
                  {t.label}
                  {t.badge !== undefined && t.badge > 0 && (
                    <span style={{
                      background: '#fbbf24', color: '#0f172a',
                      fontSize: 10, fontWeight: 700, padding: '1px 7px',
                      borderRadius: 999,
                    }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            {tab === 'pending' && (
              <div>
                {doctors.length === 0 ? (
                  <div style={{ textAlign: 'center', paddingTop: 60, color: '#475569' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15 }}>Sin solicitudes pendientes</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                    {doctors.map(d => (
                      <DoctorRow
                        key={d.id}
                        doctor={d}
                        onVerify={removeDoctor}
                        onReject={removeDoctor}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'tenants' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tenants.map(tenant => (
                  <div
                    key={tenant.id}
                    style={{
                      background: '#1e293b', border: '1px solid #334155',
                      borderRadius: 10, padding: '14px 18px',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{tenant.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>/{tenant.slug} · {tenant.plan_type}</div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 500, flexShrink: 0,
                      background: tenant.status === 'active' ? 'rgba(52,211,153,.12)' : 'rgba(239,68,68,.12)',
                      color: tenant.status === 'active' ? '#34d399' : '#f87171',
                    }}>
                      {tenant.status === 'active' ? 'Activo' : 'Suspendido'}
                    </span>
                    <button
                      onClick={() => handleTenantStatus(tenant.id, tenant.status === 'active' ? 'suspended' : 'active')}
                      style={{
                        height: 32, padding: '0 14px', borderRadius: 8,
                        border: '1px solid #334155', background: 'transparent',
                        color: '#94a3b8', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      }}
                    >
                      {tenant.status === 'active' ? <><AlertTriangle size={13} />Suspender</> : <><CheckCircle2 size={13} />Activar</>}
                    </button>
                    <ChevronRight size={16} color="#334155" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
