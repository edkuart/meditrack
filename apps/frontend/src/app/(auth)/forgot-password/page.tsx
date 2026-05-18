'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { MTInput, MTLogo } from '@/components/doctor/clinical-ui'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${API}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error al enviar el correo')
}

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--mt-bg)', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <MTLogo size={18} />
        </div>

        {sent ? (
          // ─── Success state ────────────────────────────────────────────────
          <div style={{
            background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
            borderRadius: 16, padding: '40px 32px', textAlign: 'center',
            boxShadow: '0 2px 12px rgba(15,23,42,.06)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={28} color="#16a34a" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 10px' }}>
              Revisa tu correo
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mt-text-2)', lineHeight: 1.6, margin: '0 0 24px' }}>
              Si esa dirección está registrada en meditrack, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
            </p>
            <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: '0 0 24px' }}>
              El enlace expira en 30 minutos. Revisa también tu carpeta de spam.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--mt-primary)', fontSize: 14, fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={15} /> Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          // ─── Form ─────────────────────────────────────────────────────────
          <div style={{
            background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
            borderRadius: 16, padding: '40px 32px',
            boxShadow: '0 2px 12px rgba(15,23,42,.06)',
          }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 8px' }}>
                ¿Olvidaste tu contraseña?
              </h1>
              <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: 0, lineHeight: 1.6 }}>
                Ingresa tu correo y te enviaremos un enlace para restablecerla.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MTInput
                name="email"
                label="Correo electrónico"
                icon={Mail}
                type="email"
                required
                placeholder="doctor@clinica.com"
                autoComplete="email"
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
                  transition: 'background .2s',
                }}
              >
                {loading
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
                  : 'Enviar enlace de restablecimiento'
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
        )}
      </div>
    </div>
  )
}
