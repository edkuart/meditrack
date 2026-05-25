'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { MTInput, MTLogo } from '@/components/doctor/clinical-ui'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch(`${API}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error al actualizar contraseña')
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  if (!token) {
    return (
      <AuthCard>
        <AlertCircle size={36} color="var(--mt-primary)" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 10px' }}>
          Solicita ayuda
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Los cambios de contraseña requieren un enlace emitido por el administrador de Meditrack.
        </p>
        <Link href="/forgot-password" style={{ color: 'var(--mt-primary)', fontSize: 14, fontWeight: 500 }}>
          Solicitar ayuda de contraseña
        </Link>
      </AuthCard>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirmation = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (password !== confirmation) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 15) {
      setError('La contraseña debe tener al menos 15 caracteres')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
      window.setTimeout(() => router.replace('/login'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthCard>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <CheckCircle2 size={28} color="#16a34a" />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 10px' }}>
          Contraseña actualizada
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: '0 0 24px' }}>
          Tu contraseña se actualizó correctamente. Te llevaremos al inicio de sesión.
        </p>
        <Link href="/login" style={{ color: 'var(--mt-primary)', fontSize: 14, fontWeight: 500 }}>
          Ir ahora
        </Link>
      </AuthCard>
    )
  }

  return (
    <div style={{
      background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
      borderRadius: 16, padding: '40px 32px',
      boxShadow: '0 2px 12px rgba(15,23,42,.06)',
    }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 8px' }}>
          Actualizar contraseña
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: 0, lineHeight: 1.6 }}>
          Usa el enlace emitido por el administrador de Meditrack. Expira en 30 minutos.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <MTInput
          name="password"
          label="Nueva contraseña"
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          required
          placeholder="Mínimo 15 caracteres"
          autoComplete="new-password"
          suffix={
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', display: 'flex', padding: 0 }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <MTInput
          name="confirm"
          label="Confirmar contraseña"
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          required
          placeholder="Repite la nueva contraseña"
          autoComplete="new-password"
        />

        {error && (
          <div style={{
            background: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)',
            fontSize: 13, borderRadius: 8, padding: '10px 14px',
            border: '1px solid #fecaca',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: loading ? 'var(--mt-primary-subtle)' : 'var(--mt-primary)',
            color: loading ? 'var(--mt-primary)' : '#fff',
            fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</>
            : 'Actualizar contraseña'
          }
        </button>
      </form>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <Link
          href="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--mt-primary)', fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> Volver al inicio de sesión
        </Link>
      </div>
    </div>
  )
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
      borderRadius: 16, padding: '40px 32px', textAlign: 'center',
      boxShadow: '0 2px 12px rgba(15,23,42,.06)',
    }}>
      {children}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--mt-bg)', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <MTLogo size={18} />
        </div>
        <Suspense fallback={<div style={{ textAlign: 'center', color: 'var(--mt-muted)', fontSize: 14 }}>Cargando...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
