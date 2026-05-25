'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import QRCode from 'qrcode'
import { adminLogin, setAdminToken, verifyAdminMfa } from '@/lib/admin/admin-api'

type MfaState = {
  token: string
  setup: boolean
  secret?: string
  otpauthUrl?: string
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfa, setMfa] = useState<MfaState | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!mfa?.otpauthUrl) { setQrDataUrl(null); return }
    QRCode.toDataURL(mfa.otpauthUrl, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [mfa?.otpauthUrl])

  function finishLogin() {
    setAdminToken()
    router.replace('/admin/dashboard')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const result = await adminLogin(fd.get('email') as string, fd.get('password') as string)
      if ('session' in result) {
        finishLogin()
        return
      }
      setMfa({
        token: result.mfa_token,
        setup: result.mfa_setup_required,
        secret: result.totp_secret,
        otpauthUrl: result.otpauth_url,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!mfa) return
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const result = await verifyAdminMfa(mfa.token, fd.get('code') as string)
      if (result.session === 'cookie') finishLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f172a', padding: '0 16px',
      fontFamily: 'var(--mt-font)',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'rgba(255,255,255,.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            border: '1px solid rgba(255,255,255,.12)',
          }}>
            <ShieldCheck size={24} color="#60a5fa" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
            Meditrack Admin
          </h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Acceso exclusivo para administradores del sistema
          </p>
        </div>

        {!mfa ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Correo electrónico
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@meditrack.app"
              style={{
                height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)', color: '#f1f5f9',
                padding: '0 14px', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Contraseña
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)', color: '#f1f5f9',
                padding: '0 14px', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 44, borderRadius: 8, border: 'none',
              background: '#1d4ed8', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 4,
            }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Ingresando...</>
              : 'Acceder al panel'
            }
          </button>
        </form>
        ) : (
          <form onSubmit={handleMfaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 10, padding: 14, color: '#94a3b8', fontSize: 13, lineHeight: 1.5,
            }}>
              {mfa.setup
                ? 'Configura una app autenticadora y confirma el primer código para activar MFA.'
                : 'Ingresa el código de tu app autenticadora para continuar.'}
            </div>

            {mfa.setup && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR MFA"
                    style={{ width: 220, height: 220, borderRadius: 10, background: '#fff', padding: 8 }}
                  />
                )}
                {mfa.secret && (
                  <div style={{
                    width: '100%', background: '#020617', border: '1px solid #1e293b',
                    borderRadius: 8, padding: '10px 12px', color: '#cbd5e1',
                    fontFamily: 'monospace', fontSize: 12, textAlign: 'center', wordBreak: 'break-all',
                  }}>
                    {mfa.secret}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                Código de autenticación
              </label>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="000000"
                maxLength={8}
                style={{
                  height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                  background: 'rgba(255,255,255,.06)', color: '#f1f5f9',
                  padding: '0 14px', fontSize: 16, outline: 'none',
                  letterSpacing: 2, textAlign: 'center',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 44, borderRadius: 8, border: 'none',
                background: '#1d4ed8', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 4,
              }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...</>
                : <><KeyRound size={16} /> Verificar y entrar</>
              }
            </button>
          </form>
        )}

        <p style={{ marginTop: 24, fontSize: 11, color: '#334155', textAlign: 'center' }}>
          Esta URL no es para médicos. Si eres doctor,{' '}
          <a href="/login" style={{ color: '#60a5fa' }}>accede desde aquí</a>.
        </p>
      </div>
    </div>
  )
}
