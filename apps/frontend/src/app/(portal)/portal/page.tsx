'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  Home,
  Loader2,
  Pill,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import { DoseCard } from '@/components/portal/DoseCard'
import { MTAvatar, MTLogo } from '@/components/doctor/clinical-ui'
import { getSession, saveSession, clearSession, type PatientSession } from '@/lib/portal/session'
import {
  authMagicLink,
  confirmDose,
  getAdherence,
  getEngagement,
  getTodayDoses,
  isUnauthorizedPortalError,
  type DoseEvent,
  type PatientEngagement,
} from '@/lib/portal/api'

type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────────────────────────────
// Mood face SVG (geometric)
// ─────────────────────────────────────────────
function MoodAvatar({ score }: { score: number }) {
  const happy = score >= 85
  const ok = score >= 60 && score < 85
  const tone = happy ? '#10b981' : ok ? '#0ea5e9' : '#f59e0b'
  const bg   = happy ? '#d1fae5' : ok ? '#e0f2fe'  : '#fef3c7'
  const mouth = happy
    ? 'M 32 56 Q 44 70 56 56'
    : ok
    ? 'M 32 60 L 56 60'
    : 'M 32 62 Q 44 52 56 62'

  return (
    <div style={{
      width: 88, height: 88, borderRadius: '50%',
      background: bg, boxShadow: '0 6px 18px rgba(15,23,42,.08)',
      flexShrink: 0,
    }}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{ display: 'block' }}>
        <circle cx="32" cy="40" r="3.5" fill={tone} />
        <circle cx="56" cy="40" r="3.5" fill={tone} />
        <path d={mouth} stroke={tone} strokeWidth="3" strokeLinecap="round" fill="none" />
        {happy && (
          <>
            <circle cx="22" cy="52" r="3" fill={tone} opacity="0.25" />
            <circle cx="66" cy="52" r="3" fill={tone} opacity="0.25" />
          </>
        )}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// Adherence ring card
// ─────────────────────────────────────────────
function AdherenceCard({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const circum = 2 * Math.PI * 24
  const dash = (pct / 100) * circum

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e40af 0%, #1a56db 100%)',
      color: '#fff', borderRadius: 14, padding: 16, marginBottom: 22,
      boxShadow: '0 6px 18px rgba(26,86,219,.25)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 140, height: 140,
        borderRadius: '50%', border: '40px solid rgba(255,255,255,.08)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.7)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Adherencia de hoy
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>{confirmed}</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,.85)' }}>/ {total} dosis</span>
          </div>
        </div>

        {/* Ring */}
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" />
            <circle cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${dash} ${circum}`}
              style={{ transition: 'stroke-dasharray .8s cubic-bezier(0,0,.2,1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
          }}>{pct}%</div>
        </div>
      </div>

      {total > confirmed && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
          {total - confirmed} dosis pendiente{total - confirmed > 1 ? 's' : ''} hoy
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Bottom nav button
// ─────────────────────────────────────────────
function NavBtn({ icon: Icon, label, active, href }: { icon: React.ElementType; label: string; active?: boolean; href: string }) {
  return (
    <Link href={href} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      color: active ? 'var(--mt-primary)' : 'var(--mt-muted)',
      textDecoration: 'none', fontSize: 10.5, fontWeight: active ? 500 : 400,
    }}>
      <span style={{
        padding: '4px 14px', borderRadius: 999,
        background: active ? 'var(--mt-primary-subtle)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .2s',
      }}>
        <Icon size={18} color={active ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
      </span>
      {label}
    </Link>
  )
}

// ─────────────────────────────────────────────
// Portal content
// ─────────────────────────────────────────────
function PortalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [session, setSession] = useState<PatientSession | null>(null)
  const [doses, setDoses] = useState<DoseEvent[]>([])
  const [adherence, setAdherence] = useState<{ score: number; avatar_state: AvatarState } | null>(null)
  const [engagement, setEngagement] = useState<PatientEngagement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const urlToken = searchParams.get('token')
      const forceFreshSession = searchParams.get('fresh') === '1'
      try {
        if (forceFreshSession || urlToken) clearSession()
        if (urlToken) {
          const result = await authMagicLink(urlToken)
          const s: PatientSession = { token: result.session_token, patient: result.patient }
          saveSession(s)
          setSession(s)
        } else {
          const existing = getSession()
          if (!existing) {
            setError('Abre el enlace de acceso que te compartió tu equipo médico para entrar al portal.')
            setLoading(false)
            return
          }
          setSession(existing)
        }
      } catch {
        setError('El enlace es inválido o ya expiró. Pide a tu médico un nuevo acceso.')
        setLoading(false)
      }
    }
    init()
  }, [searchParams, router])

  const loadData = useCallback(async (token: string) => {
    try {
      const [dosesData, adherenceData, engagementData] = await Promise.all([
        getTodayDoses(token),
        getAdherence(token),
        getEngagement(token),
      ])
      setDoses(dosesData)
      setAdherence(adherenceData)
      setEngagement(engagementData)
      if (window.location.search.includes('token=')) {
        window.history.replaceState({}, '', '/portal')
      }
    } catch (err) {
      if (isUnauthorizedPortalError(err)) {
        clearSession()
        setError('Tu enlace de acceso expiró o ya no es válido. Pide a tu equipo médico un nuevo enlace.')
        return
      }
      setError('No se pudo cargar tu información. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { if (session) loadData(session.token) }, [session, loadData])

  async function handleConfirm(doseId: string) {
    if (!session) return
    const updated = await confirmDose(session.token, doseId)
    setDoses(prev => prev.map(d => d.id === doseId ? { ...d, ...updated } : d))
    getAdherence(session.token).then(setAdherence).catch(() => {})
    getEngagement(session.token).then(setEngagement).catch(() => {})
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 300 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--mt-text)', marginBottom: 8 }}>Acceso no válido</p>
          <p style={{ fontSize: 14, color: 'var(--mt-text-2)' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
        <p style={{ fontSize: 14, color: 'var(--mt-muted)' }}>Cargando tu tratamiento...</p>
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = session?.patient.first_name ?? ''
  const patientName = `${session?.patient.first_name ?? ''} ${session?.patient.last_name ?? ''}`.trim()
  const confirmedToday = doses.filter(d => d.status === 'CONFIRMED').length
  const totalToday = doses.filter(d => d.status !== 'CANCELLED').length
  const score = adherence?.score ?? 70
  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 440,
      margin: '0 auto', background: 'var(--mt-bg)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Topbar */}
      <header style={{
        height: 56, padding: '0 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--mt-border)',
        background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(8px)',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <MTLogo size={15} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{
            position: 'relative', width: 34, height: 34, borderRadius: 8, border: 'none',
            background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Bell size={16} />
            <span style={{
              position: 'absolute', top: 7, right: 7, width: 7, height: 7,
              borderRadius: '50%', background: 'var(--mt-danger)', border: '1.5px solid #fff',
            }} />
          </button>
          {patientName && <MTAvatar name={patientName} size={32} tone={{ bg: '#dbeafe', fg: '#1a56db' }} />}
        </div>
      </header>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 96px' }} className="mt-page-in mt-scroll">
        {/* Greeting + mood */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div className="mt-micro" style={{ color: 'var(--mt-muted)', marginBottom: 6 }}>{greeting}</div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: 'var(--mt-text)',
              letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0,
            }}>
              {firstName},<br />
              {score >= 80 ? 'vas muy bien.' : score >= 60 ? 'sigue adelante.' : 'un paso a la vez.'}
            </h1>
          </div>
          <MoodAvatar score={score} />
        </div>

        {/* Adherence ring card */}
        <AdherenceCard confirmed={confirmedToday} total={totalToday} />

        {/* Doses section */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--mt-text)', letterSpacing: '-0.01em', margin: 0 }}>
            Dosis de hoy
          </h2>
          <span className="mt-small">{today}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
          {doses.length === 0 ? (
            <div style={{
              background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
              borderRadius: 14, padding: '32px 24px', textAlign: 'center',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: 'var(--mt-success-subtle)',
                color: 'var(--mt-success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <ShieldCheck size={22} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--mt-text)', margin: '0 0 4px' }}>
                No hay dosis programadas para hoy
              </p>
              <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>
                Revisa tu tratamiento completo si tienes dudas.
              </p>
            </div>
          ) : (
            doses.map(dose => (
              <DoseCard key={dose.id} dose={dose} onConfirm={handleConfirm} />
            ))
          )}
        </div>

        {/* Quick links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {[
            { href: '/portal/treatment', icon: ClipboardList, label: 'Mi tratamiento completo', sub: 'Ver todos los medicamentos' },
            { href: '/portal/history',   icon: Stethoscope,  label: 'Mis consultas',            sub: 'Historial de encuentros' },
            { href: '/portal/documents', icon: FileText,     label: 'Mis documentos',           sub: 'Resultados y recetas' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
                borderRadius: 12, textDecoration: 'none', transition: 'border-color .2s',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <item.icon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)' }}>{item.label}</div>
                <div style={{ fontSize: 13, color: 'var(--mt-muted)', marginTop: 1 }}>{item.sub}</div>
              </div>
              <ChevronRight size={16} color="var(--mt-muted)" />
            </Link>
          ))}
        </div>

        <p style={{
          marginTop: 20, textAlign: 'center', fontSize: 12,
          color: 'var(--mt-muted)', lineHeight: 1.5,
        }}>
          Si algo no coincide con las indicaciones recibidas, consulta con tu equipo médico.
        </p>
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 76, padding: '8px 12px 22px',
        background: 'rgba(255,255,255,.95)', backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--mt-border)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      }}>
        <NavBtn icon={Home}          label="Hoy"        href="/portal"           active />
        <NavBtn icon={Pill}          label="Plan"       href="/portal/treatment"            />
        <NavBtn icon={ClipboardList} label="Consultas"  href="/portal/history"              />
        <NavBtn icon={FileText}      label="Documentos" href="/portal/documents"            />
      </nav>
    </div>
  )
}

export default function PortalPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-primary)' }} />
      </div>
    }>
      <PortalContent />
    </Suspense>
  )
}
