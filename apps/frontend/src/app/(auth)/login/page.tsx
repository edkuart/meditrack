'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getDefaultClinicalPath } from '@/lib/doctor/navigation'
import { MTInput, MTLogo, MTButton } from '@/components/doctor/clinical-ui'

// ─────────────────────────────────────────────
// ECG pulse background pattern
// ─────────────────────────────────────────────
function PulsePattern() {
  return (
    <svg
      width="100%" height="100%"
      style={{ position: 'absolute', inset: 0, opacity: 0.12 }}
      preserveAspectRatio="none"
      viewBox="0 0 600 800"
    >
      <defs>
        <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#fff" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
      <path
        d="M -50 400 L 100 400 L 130 400 L 145 380 L 160 420 L 175 340 L 195 460 L 215 400 L 280 400 L 310 400 L 325 380 L 340 420 L 355 340 L 375 460 L 395 400 L 460 400 L 490 400 L 505 380 L 520 420 L 535 340 L 555 460 L 575 400 L 650 400"
        fill="none" stroke="#fff" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.6"
      />
      <circle cx="120" cy="180" r="80"  fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" />
      <circle cx="120" cy="180" r="140" fill="none" stroke="#fff" strokeWidth="1" opacity="0.2" />
      <circle cx="500" cy="620" r="100" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" />
      <circle cx="500" cy="620" r="180" fill="none" stroke="#fff" strokeWidth="1" opacity="0.2" />
    </svg>
  )
}

function BrandedPanel() {
  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: 'linear-gradient(160deg, #1D4ED8 0%, #2563EB 45%, #6366F1 100%)',
      color: '#fff', position: 'relative', overflow: 'hidden',
      padding: '40px clamp(28px, 4vw, 48px)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <PulsePattern />

      {/* Logo */}
      <div style={{ position: 'relative' }}>
        <MTLogo size={20} mono />
      </div>

      {/* Main copy */}
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: 14,
        }}>
          Adherencia terapéutica
        </div>
        <h2 style={{
          fontSize: 'clamp(28px, 3.2vw, 42px)', fontWeight: 700, lineHeight: 1.08,
          letterSpacing: 0, marginBottom: 14, margin: '0 0 16px',
          textWrap: 'balance',
        }}>
          Cuidado clínico que sigue al paciente fuera del consultorio.
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', lineHeight: 1.6, margin: 0 }}>
          Planes de tratamiento, seguimiento de dosis y comunicación con el paciente —
          todo en una sola vista para tu equipo.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, marginTop: 30 }}>
          {[
            { n: '128k', l: 'dosis confirmadas / mes' },
            { n: '+6 pp', l: 'adherencia promedio' },
            { n: '240+', l: 'clínicas en LATAM' },
          ].map(s => (
            <div key={s.n}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0 }}>{s.n}</div>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,.7)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2,
              }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance badge */}
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: 'rgba(255,255,255,.72)', flexWrap: 'wrap',
      }}>
        <ShieldCheck size={14} color="rgba(255,255,255,.7)" />
        HIPAA · Habeas Data Colombia · ISO 27001
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Login form
// ─────────────────────────────────────────────
function LoginForm({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  loading: boolean
  error: string
}) {
  const [showPw, setShowPw] = useState(false)

  return (
    <form onSubmit={onSubmit} style={{
      width: '100%', maxWidth: 410,
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div>
        <div className="mt-micro" style={{ color: 'var(--mt-purple)', marginBottom: 8 }}>
          Acceso clínico
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: 'var(--mt-text)',
          letterSpacing: 0, margin: '0 0 8px',
        }}>
          Bienvenida de vuelta
        </h1>
        <p className="mt-small">Ingresa con tu correo institucional para continuar.</p>
      </div>

      <MTInput
        name="email"
        label="Correo electrónico"
        icon={Mail}
        type="email"
        required
        placeholder="doctor@clinica.com"
        autoComplete="email"
      />

      <MTInput
        name="password"
        label="Contraseña"
        icon={Lock}
        type={showPw ? 'text' : 'password'}
        required
        placeholder="••••••••"
        autoComplete="current-password"
        suffix={
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--mt-muted)', display: 'flex', padding: 0,
            }}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 16, fontSize: 13, flexWrap: 'wrap',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--mt-text-2)' }}>
          <span style={{
            width: 16, height: 16, borderRadius: 4,
            border: '1.5px solid var(--mt-purple)', background: 'var(--mt-purple)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          Mantener sesión
        </label>
        <Link href="/forgot-password" style={{ color: 'var(--mt-purple)', fontWeight: 500 }}>
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      {error && (
        <div style={{
          background: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)',
          fontSize: 13, borderRadius: 8, padding: '10px 14px', border: '1px solid #fecaca',
        }}>
          {error}
        </div>
      )}

      <MTButton
        type="submit"
        variant="solid"
        size="lg"
        disabled={loading}
        icon={loading ? Loader2 : undefined}
        iconRight={loading ? undefined : ArrowRight}
        style={{ width: '100%', height: 44 }}
      >
        {loading ? 'Ingresando...' : 'Ingresar al panel'}
      </MTButton>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        color: 'var(--mt-muted)', fontSize: 12, margin: '4px 0',
      }}>
        <span style={{ flex: 1, height: 1, background: 'var(--mt-border)' }} />
        o continúa con
        <span style={{ flex: 1, height: 1, background: 'var(--mt-border)' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <MTButton variant="outline" type="button">SSO institucional</MTButton>
        <MTButton variant="outline" type="button">Google Workspace</MTButton>
      </div>

      <p style={{ fontSize: 13, color: 'var(--mt-text-2)', margin: 0, textAlign: 'center' }}>
        ¿Tu clínica aún no está registrada?{' '}
        <Link href="/register" style={{ color: 'var(--mt-purple)', fontWeight: 500 }}>
          Solicitar acceso →
        </Link>
      </p>
    </form>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    const password = fd.get('password') as string
    try {
      const user = await login(email, password)
      const selectedPlan = window.localStorage.getItem('meditrack_selected_plan')
      if (
        user.is_verified &&
        user.tenant_plan === 'free' &&
        (selectedPlan === 'doctor_individual' || selectedPlan === 'clinic_complete')
      ) {
        router.replace(`/settings/billing?plan=${selectedPlan}`)
        return
      }
      router.replace(getDefaultClinicalPath(user))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: 'var(--mt-bg)',
      fontFamily: 'var(--mt-font)',
    }}>
      {/* Branded left panel — hidden on mobile */}
      <div className="hidden md:flex" style={{
        flex: '0 0 clamp(360px, 36vw, 520px)',
        minHeight: '100vh',
      }}>
        <BrandedPanel />
      </div>

      {/* Form panel */}
      <div className="px-5 sm:px-12" style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto', paddingTop: 40, paddingBottom: 40,
      }}>
        {/* Mobile logo */}
        <div className="md:hidden" style={{ position: 'absolute', top: 24, left: 24 }}>
          <MTLogo size={18} />
        </div>
        <LoginForm onSubmit={handleSubmit} loading={loading} error={error} />
      </div>
    </div>
  )
}
